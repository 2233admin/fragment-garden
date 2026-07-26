import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function getBaseURL(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("The Playwright project must define a baseURL.");
  return baseURL;
}

function readClientRequestId(route: Route): string {
  const body = route.request().postDataBuffer()?.toString("utf8") ?? "";
  return body.match(/name="clientRequestId"\r?\n\r?\n([^\r\n]+)/u)?.[1] ?? "image-e2e-request";
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, getBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
}

async function openImageCreator(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "图片", exact: true }).click();
  const imageDialog = page.getByRole("dialog", { name: "种下图片碎片" });
  await expect(imageDialog).toBeVisible();
  return imageDialog;
}

async function submitImage(
  page: Page,
  fileName: string,
  title: string,
  expectDisclosure = true,
): Promise<void> {
  const imageDialog = await openImageCreator(page);
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(imageDialog.getByAltText("待保存的图片预览")).toBeVisible();
  await imageDialog.getByLabel("标题（可选）").fill(title);
  await imageDialog.getByRole("button", { name: "开始整理", exact: true }).click();

  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  if (expectDisclosure) {
    await expect(disclosure).toBeVisible();
    await disclosure.getByRole("button", { name: "同意并分析", exact: true }).click();
  } else {
    await expect(disclosure).toBeHidden();
  }
}

async function fulfillFailure(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify({
      error: {
        code: "request_timeout",
        message: "图片分析超时。",
        requestId: "00000000-0000-4000-8000-000000000099",
      },
    }),
    contentType: "application/json",
    status: 504,
  });
}

async function fulfillSuccess(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify({
      requestId: "00000000-0000-4000-8000-000000000002",
      clientRequestId: readClientRequestId(route),
      analysis: {
        title: "重试后整理好的图片",
        markdown: "## 整理结果\n\n这张图片在手动重试后成功整理。",
      },
    }),
    contentType: "application/json",
    status: 200,
  });
}

test("failed image job keeps its Blob, retries in place, and deletion removes another temporary job", async ({
  context,
  page,
}) => {
  let analysisRequestCount = 0;
  let transcriptionRequestCount = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/media/audio/transcribe")) transcriptionRequestCount += 1;
  });
  await page.route("**/api/media/image/analyze", async (route) => {
    analysisRequestCount += 1;
    if (analysisRequestCount === 2) {
      await fulfillSuccess(route);
      return;
    }
    await fulfillFailure(route);
  });

  await initializeGarden(context, page);
  await submitImage(page, "retry.png", "等待重试的图片");
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("failed");

  const failedState = await readFragmentGardenPersistence(page);
  const retryJobId = failedState.contentProcessingJobs[0]?.id;
  expect(retryJobId).toBeTruthy();
  expect(failedState.contentProcessingJobs[0]).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    createdFragmentId: null,
    errorCode: "request_timeout",
    kind: "image",
    status: "failed",
  });
  expect(failedState.fragments).toEqual([]);
  expect(failedState.plants).toEqual([]);
  expect(failedState.fragmentEvents).toEqual([]);
  expect(failedState.mediaAssets).toEqual([]);
  await expect(page.getByRole("button", { name: /^打开笔记：/u })).toHaveCount(0);

  const processingDialog = page.getByRole("dialog", { name: "正在整理的内容" });
  const failedRow = processingDialog.getByRole("listitem").filter({ hasText: "retry.png" });
  await expect(failedRow).toContainText("原图仍保存在本地任务中");
  await failedRow.getByRole("button", { name: "重试", exact: true }).click();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("completed");

  const completedState = await readFragmentGardenPersistence(page);
  expect(completedState.contentProcessingJobs).toHaveLength(1);
  expect(completedState.contentProcessingJobs[0]).toMatchObject({
    blobSize: 0,
    id: retryJobId,
    status: "completed",
  });
  expect(completedState.fragments).toHaveLength(1);
  expect(completedState.plants).toHaveLength(1);
  expect(completedState.mediaAssets).toHaveLength(1);
  expect(completedState.fragmentEvents.filter((event) => event.type === "created")).toHaveLength(1);

  await processingDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await submitImage(page, "cancel.png", "不会留下空卡片的图片", false);
  await expect
    .poll(async () => {
      const state = await readFragmentGardenPersistence(page);
      return state.contentProcessingJobs.find((job) => job.sourceFileName === "cancel.png")?.status;
    })
    .toBe("failed");

  const secondFailureState = await readFragmentGardenPersistence(page);
  const removableJob = secondFailureState.contentProcessingJobs.find(
    (job) => job.sourceFileName === "cancel.png",
  );
  expect(removableJob).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    createdFragmentId: null,
    status: "failed",
  });
  expect(secondFailureState.fragments).toHaveLength(1);
  expect(secondFailureState.plants).toHaveLength(1);
  expect(secondFailureState.mediaAssets).toHaveLength(1);

  const removableRow = processingDialog.getByRole("listitem").filter({ hasText: "cancel.png" });
  await removableRow.getByRole("button", { name: "删除任务", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "删除这条整理任务？" });
  await expect(confirmation).toContainText("本地原图会被删除");
  await confirmation.getByRole("button", { name: "删除任务", exact: true }).click();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs.length)
    .toBe(1);

  const finalState = await readFragmentGardenPersistence(page);
  expect(finalState.contentProcessingJobs[0]?.id).toBe(retryJobId);
  expect(finalState.fragments).toHaveLength(1);
  expect(finalState.plants).toHaveLength(1);
  expect(finalState.mediaAssets).toHaveLength(1);
  expect(finalState.fragmentEvents.filter((event) => event.type === "created")).toHaveLength(1);
  await expect(page.getByRole("button", { name: "打开笔记：不会留下空卡片的图片" })).toHaveCount(0);
  expect(analysisRequestCount).toBe(3);
  expect(transcriptionRequestCount).toBe(0);
  await expect.poll(async () => page.locator("canvas").count()).toBeLessThanOrEqual(1);
});
