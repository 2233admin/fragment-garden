import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

const IMAGE_TITLE = "周末花园截图";
const IMAGE_SUMMARY = "一张包含简单标签的花园截图。";
const IMAGE_VISIBLE_TEXT = "从这里开始";
const IMAGE_NOTE = "记录这张图里的布局。";

// A tiny valid PNG keeps the test deterministic and avoids checking in binary fixtures.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function getBaseUrl(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("The Playwright project must define a baseURL.");
  return baseURL;
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, getBaseUrl());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
}

async function openImageCreator(page: Page) {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "图片", exact: true }).click();
  const imageDialog = page.getByRole("dialog", { name: "种下图片碎片" });
  await expect(imageDialog).toBeVisible();
  return imageDialog;
}

test("keeps image local before disclosure and renders the persisted analysis as note content", async ({
  context,
  page,
}) => {
  let analysisRequestCount = 0;
  let releaseAnalysis!: () => void;
  const analysisBlocked = new Promise<void>((resolve) => {
    releaseAnalysis = resolve;
  });
  await page.route("**/api/media/image/analyze", async (route) => {
    analysisRequestCount += 1;
    const body = (await route.request().postDataBuffer())?.toString("utf8") ?? "";
    const clientRequestId =
      body.match(/name="clientRequestId"\r?\n\r?\n([^\r\n]+)/u)?.[1] ?? "image-e2e-request";
    await analysisBlocked;
    await route.fulfill({
      body: JSON.stringify({
        requestId: "00000000-0000-4000-8000-000000000001",
        clientRequestId,
        analysis: {
          title: "模型生成标题",
          summary: IMAGE_SUMMARY,
          visibleText: IMAGE_VISIBLE_TEXT,
          contentKind: "screenshot",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await initializeGarden(context, page);
  const imageDialog = await openImageCreator(page);
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name: "garden.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(imageDialog.getByAltText("待保存的图片预览")).toBeVisible();
  await imageDialog.getByLabel("标题（可选）").fill(IMAGE_TITLE);
  await imageDialog.getByLabel("补充说明（可选）").fill(IMAGE_NOTE);
  await imageDialog.getByRole("button", { name: "种下图片", exact: true }).click();
  await expect(imageDialog).toBeHidden();

  await expect(page.getByRole("button", { name: `打开笔记：${IMAGE_TITLE}` })).toBeVisible();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets)
    .toHaveLength(1);
  const localState = await readFragmentGardenPersistence(page);
  expect(localState.fragments).toHaveLength(1);
  expect(localState.fragments[0]?.contentType).toBe("image");
  expect(localState.mediaAssets[0]?.processingStatus).toBe("pending");
  expect(localState.mediaAssets[0]?.blobSize).toBe(PNG_BYTES.byteLength);

  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  await expect(disclosure).toBeVisible();
  await disclosure.getByRole("button", { name: "同意并分析", exact: true }).click();
  await expect.poll(() => analysisRequestCount).toBe(1);
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets[0]?.processingStatus)
    .toBe("processing");

  releaseAnalysis();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets[0]?.processingStatus)
    .toBe("completed");
  expect((await readFragmentGardenPersistence(page)).fragments[0]?.title).toBe(IMAGE_TITLE);

  await page.getByRole("button", { name: `打开笔记：${IMAGE_TITLE}` }).click();
  const detail = page.getByRole("dialog", { name: IMAGE_TITLE });
  await expect(detail.getByAltText(`用户上传的图片：${IMAGE_TITLE}`)).toBeVisible();
  await expect(detail.getByText(IMAGE_SUMMARY, { exact: true })).toBeVisible();
  await expect(detail.getByText(IMAGE_VISIBLE_TEXT, { exact: true })).toBeVisible();
  await expect(detail.getByText(IMAGE_NOTE, { exact: true })).toBeVisible();
  await expect(detail).not.toContainText(/分析完成|处理状态|图片摘要|可见文字|成长分|成长阶段/u);
  await expect(detail.getByRole("button", { name: /分析图片|重新分析/u })).toHaveCount(0);

  await detail.getByRole("button", { name: "返回", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await page.getByRole("button", { name: `打开笔记：${IMAGE_TITLE}` }).click();
  const refreshedDetail = page.getByRole("dialog", { name: IMAGE_TITLE });
  await expect(refreshedDetail.getByAltText(`用户上传的图片：${IMAGE_TITLE}`)).toBeVisible();
  await expect(refreshedDetail.getByText(IMAGE_SUMMARY, { exact: true })).toBeVisible();
  await expect(refreshedDetail.getByText(IMAGE_VISIBLE_TEXT, { exact: true })).toBeVisible();
  expect((await readFragmentGardenPersistence(page)).mediaAssets[0]?.processingStatus).toBe(
    "completed",
  );
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
});
