import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

function baseUrl(): string {
  const value = test.info().project.use.baseURL;
  if (typeof value !== "string") throw new Error("Missing Playwright baseURL");
  return value;
}

function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
}

async function initialize(page: Page, context: BrowserContext): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, baseUrl());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "种下碎片", exact: true })).toBeVisible();
}

test("image fragments are saved locally before analysis and survive refresh", async ({
  context,
  page,
}) => {
  const captured = { clientRequestId: null as string | null };
  let releaseRequest!: () => void;
  const requestBlocked = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/media/image/analyze", async (route) => {
    const body = (await route.request().postDataBuffer())?.toString("utf8") ?? "";
    captured.clientRequestId =
      body.match(/name="clientRequestId"\r?\n\r?\n([^\r\n]+)/u)?.[1] ?? null;
    await requestBlocked;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        clientRequestId: captured.clientRequestId,
        analysis: {
          title: "截图里的小计划",
          summary: "一张包含简单计划的截图。",
          visibleText: "今天先整理一个小步骤",
          contentKind: "screenshot",
        },
      }),
      status: 200,
    });
  });

  await initialize(page, context);
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "图片", exact: true }).click();
  const imageDialog = page.getByRole("dialog", { name: "种下图片碎片" });
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name: "plan.png",
    mimeType: "image/png",
    buffer: tinyPng(),
  });
  await expect(imageDialog.locator("img")).toBeVisible();
  await imageDialog.getByRole("button", { name: "种下图片", exact: true }).click();
  await expect(imageDialog).toBeHidden();
  await expect(page.getByText("图片已经先种下了。", { exact: true })).toBeVisible();

  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  await expect(disclosure).toBeVisible();
  await disclosure.getByRole("button", { name: "同意并分析", exact: true }).click();

  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets.length)
    .toBe(1);
  const localState = await readFragmentGardenPersistence(page);
  expect(localState.fragments).toHaveLength(1);
  expect(localState.plants).toHaveLength(1);
  expect(localState.mediaAssets[0]).toMatchObject({
    kind: "image",
    mimeType: "image/png",
    processingStatus: "processing",
    blobSize: tinyPng().length,
  });

  releaseRequest();
  await expect(page.getByText("截图里的小计划", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "打开笔记：截图里的小计划" })).toBeVisible();
  await page.getByRole("button", { name: "打开笔记：截图里的小计划" }).click();
  const detail = page.getByRole("dialog", { name: "截图里的小计划" });
  await expect(detail.getByAltText("用户上传的图片：截图里的小计划")).toBeVisible();
  await expect(detail.getByText("一张包含简单计划的截图。", { exact: true })).toBeVisible();
  await expect(detail.getByText("今天先整理一个小步骤", { exact: true })).toBeVisible();
  await expect(detail).not.toContainText(/分析完成|处理状态|图片摘要|可见文字|成长分|成长阶段/u);
  await expect(detail.getByRole("button", { name: /分析图片|重新分析/u })).toHaveCount(0);
});

test("local-only image choice does not call the analysis route", async ({ context, page }) => {
  let requestCount = 0;
  await page.route("**/api/media/image/analyze", async (route) => {
    requestCount += 1;
    await route.abort();
  });
  await initialize(page, context);
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "图片", exact: true }).click();
  const imageDialog = page.getByRole("dialog", { name: "种下图片碎片" });
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name: "local.png",
    mimeType: "image/png",
    buffer: tinyPng(),
  });
  await imageDialog.getByRole("button", { name: "种下图片", exact: true }).click();
  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  await disclosure.getByRole("button", { name: "仅保存在本地", exact: true }).click();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets[0]?.processingStatus)
    .toBe("local_only");
  expect(requestCount).toBe(0);
});
