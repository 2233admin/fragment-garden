import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

const USER_TITLE = "周末花园截图";
const USER_NOTE = "记录这张图里的布局。";
const GENERATED_TITLE = "截图里的小计划";
const GENERATED_MARKDOWN =
  "## 图片观察\n\n画面里有一张简洁的花园布局草图。\n\n- 从入口开始整理\n- 留出一处阅读角落";

// A tiny valid PNG keeps the test deterministic and avoids checking in binary fixtures.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type Deferred = Readonly<{
  promise: Promise<void>;
  release: () => void;
}>;

function getBaseURL(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("The Playwright project must define a baseURL.");
  return baseURL;
}

function createDeferred(): Deferred {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release?.() };
}

function readMultipartField(body: string, fieldName: string): string | null {
  return body.match(new RegExp(`name="${fieldName}"\\r?\\n\\r?\\n([^\\r\\n]+)`, "u"))?.[1] ?? null;
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, getBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "种下碎片", exact: true })).toBeVisible();
}

async function openImageCreator(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "图片", exact: true }).click();
  const imageDialog = page.getByRole("dialog", { name: "种下图片碎片" });
  await expect(imageDialog).toBeVisible();
  await expect(createDialog.getByRole("button", { name: "语音", exact: true })).toHaveCount(0);
  return imageDialog;
}

async function selectImage(imageDialog: Locator, name: string): Promise<void> {
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(imageDialog.getByAltText("待保存的图片预览")).toBeVisible();
}

async function expectNoFormalContent(page: Page): Promise<void> {
  const state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toEqual([]);
  expect(state.plants).toEqual([]);
  expect(state.fragmentEvents).toEqual([]);
  expect(state.mediaAssets).toEqual([]);
  expect(state.externalLinkImports).toEqual([]);
  await expect(page.getByRole("button", { name: /^打开笔记：/u })).toHaveCount(0);
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "0",
  );
}

test("image disclosure traps focus and cancellation restores the image submit control", async ({
  context,
  page,
}) => {
  let analysisRequestCount = 0;
  await page.route("**/api/media/image/analyze", async (route) => {
    analysisRequestCount += 1;
    await route.abort();
  });

  await initializeGarden(context, page);
  const imageDialog = await openImageCreator(page);
  await selectImage(imageDialog, "focus-boundary.png");
  const startButton = imageDialog.getByRole("button", { name: "开始整理", exact: true });
  await startButton.click();

  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  const cancelButton = disclosure.getByRole("button", { name: "取消", exact: true });
  const acceptButton = disclosure.getByRole("button", { name: "同意并分析", exact: true });
  await expect(disclosure).toBeVisible();
  await expect(cancelButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(acceptButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(acceptButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(disclosure).toBeHidden();
  await expect(startButton).toBeFocused();

  expect(analysisRequestCount).toBe(0);
  const state = await readFragmentGardenPersistence(page);
  expect(state.contentProcessingJobs).toEqual([]);
  expect(state.fragments).toEqual([]);
  expect(state.plants).toEqual([]);
  expect(state.fragmentEvents).toEqual([]);
  expect(state.mediaAssets).toEqual([]);
});

test("image disclosure precedes the temporary job and success atomically creates the note", async ({
  context,
  page,
}) => {
  const providerGate = createDeferred();
  let analysisRequestCount = 0;
  let capturedClientRequestId: string | null = null;
  await page.route("**/api/media/image/analyze", async (route) => {
    analysisRequestCount += 1;
    const body = (await route.request().postDataBuffer())?.toString("utf8") ?? "";
    capturedClientRequestId = readMultipartField(body, "clientRequestId");
    await providerGate.promise;
    await route.fulfill({
      body: JSON.stringify({
        requestId: "00000000-0000-4000-8000-000000000001",
        clientRequestId: capturedClientRequestId,
        analysis: {
          title: GENERATED_TITLE,
          markdown: GENERATED_MARKDOWN,
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await initializeGarden(context, page);
  const imageDialog = await openImageCreator(page);
  await selectImage(imageDialog, "garden.png");
  await imageDialog.getByLabel("标题（可选）").fill(USER_TITLE);
  await imageDialog.getByLabel("补充说明（可选）").fill(USER_NOTE);
  await imageDialog.getByRole("button", { name: "开始整理", exact: true }).click();

  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  await expect(disclosure).toBeVisible();
  await expect(disclosure.getByRole("button", { name: "仅保存在本地", exact: true })).toHaveCount(
    0,
  );
  expect(analysisRequestCount).toBe(0);
  expect((await readFragmentGardenPersistence(page)).contentProcessingJobs).toEqual([]);
  await expectNoFormalContent(page);

  await disclosure.getByRole("button", { name: "同意并分析", exact: true }).click();
  await expect.poll(() => analysisRequestCount).toBe(1);
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("processing");

  const processingState = await readFragmentGardenPersistence(page);
  const processingJobId = processingState.contentProcessingJobs[0]?.id;
  expect(processingState.contentProcessingJobs).toHaveLength(1);
  expect(processingState.contentProcessingJobs[0]).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    createdFragmentId: null,
    kind: "image",
    sourceFileName: "garden.png",
    sourceMimeType: "image/png",
    status: "processing",
    userNoteMarkdown: USER_NOTE,
    userTitle: USER_TITLE,
  });
  expect(processingState.imageAiDisclosureAcceptedAt).not.toBeNull();
  await expectNoFormalContent(page);

  providerGate.release();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("completed");

  const completedState = await readFragmentGardenPersistence(page);
  expect(completedState.fragments).toHaveLength(1);
  expect(completedState.plants).toHaveLength(1);
  expect(completedState.mediaAssets).toHaveLength(1);
  expect(completedState.fragmentEvents.filter((event) => event.type === "created")).toHaveLength(1);
  expect(completedState.contentProcessingJobs).toHaveLength(1);
  expect(completedState.contentProcessingJobs[0]).toMatchObject({
    blobSize: 0,
    createdFragmentId: completedState.fragments[0]?.id,
    id: processingJobId,
    status: "completed",
  });
  expect(completedState.fragments[0]).toMatchObject({
    contentType: "image",
    title: USER_TITLE,
  });
  expect(completedState.fragments[0]?.contentMarkdown).toContain(USER_NOTE);
  expect(completedState.fragments[0]?.contentMarkdown).toContain(GENERATED_MARKDOWN);
  expect(completedState.mediaAssets[0]).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    fragmentId: completedState.fragments[0]?.id,
    kind: "image",
    mimeType: "image/png",
    processingStatus: "completed",
  });

  const processingDialog = page.getByRole("dialog", { name: "正在整理的内容" });
  await processingDialog.getByRole("button", { name: "查看笔记", exact: true }).click();
  const detail = page.getByRole("dialog", { name: USER_TITLE });
  await expect(detail.getByAltText(`用户上传的图片：${USER_TITLE}`)).toBeVisible();
  await expect(detail.getByText(USER_NOTE, { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "图片观察", exact: true })).toBeVisible();
  await expect(detail.getByText("画面里有一张简洁的花园布局草图。", { exact: true })).toBeVisible();
  await expect(detail.getByText("从入口开始整理", { exact: true })).toBeVisible();
  await expect(detail).not.toContainText(
    /summary|visibleText|contentKind|分析状态|处理状态|OCR|provider|成长分|生命周期/u,
  );
  await detail.getByRole("button", { name: "返回", exact: true }).click();

  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await page.getByRole("button", { name: `打开笔记：${USER_TITLE}` }).click();
  const refreshedDetail = page.getByRole("dialog", { name: USER_TITLE });
  await expect(refreshedDetail.getByAltText(`用户上传的图片：${USER_TITLE}`)).toBeVisible();
  await expect(refreshedDetail.getByText(USER_NOTE, { exact: true })).toBeVisible();
  expect((await readFragmentGardenPersistence(page)).mediaAssets[0]?.blobSize).toBe(
    PNG_BYTES.byteLength,
  );
  await expect.poll(async () => page.locator("canvas").count()).toBeLessThanOrEqual(1);
});
