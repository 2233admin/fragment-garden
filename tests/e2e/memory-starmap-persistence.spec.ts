import {
  expect,
  test,
  type BrowserContext,
  type Download,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import {
  BACKUP_IMAGE_TITLE,
  BACKUP_SOURCE_TITLE,
  clearAllGardenTables,
  seedGardenBackupFixture,
} from "./helpers/garden-backup";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";
import { mockLinkImportRoutes, type LinkImportMockResponse } from "./helpers/link-import-mocks";

const LINK_URL = "https://example.com/notes/quiet-observation?utm_source=e2e";
const LINK_SHARE_TEXT = `刚刚看到一段很值得保存的内容 ✨ ${LINK_URL} 复制这段文字后打开即可。`;
const FAILED_LINK_URL = "https://example.org/notes/unavailable";
const LINK_TITLE = "把安静的观察和稍纵即逝的判断留在这片缓慢旋转的星空里";
const LINK_NOTE = "以后想从这里继续追踪这个判断。";
const LINK_SUMMARY = "一段关于慢下来观察日常细节的记录。";
const LINK_CONTENT = "先记住此刻真正吸引注意力的地方，再决定下一步。";
const IMAGE_TITLE = "窗边光影和午后墙面上缓慢移动的细微颜色观察记录";
const IMAGE_NOTE = "记住这束光落下来的位置。";
const IMAGE_MARKDOWN = "## 图片观察\n\n画面里有一束落在窗边的柔和光线。\n\n- 保留光影方向";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type Deferred = Readonly<{
  promise: Promise<void>;
  release: () => void;
}>;

function requireBaseURL(): string {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required.");
  return baseURL;
}

function createDeferred(): Deferred {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release?.() };
}

function completedLinkResponse(): LinkImportMockResponse {
  return {
    body: {
      status: "completed",
      externalNoteId: "90071992547409939991",
      title: LINK_TITLE,
      summary: LINK_SUMMARY,
      sourceContent: LINK_CONTENT,
      canonicalUrl: "https://example.com/notes/quiet-observation",
      truncated: false,
      requestId: "memory-starmap-link-success",
    },
  };
}

function failedLinkResponse(): LinkImportMockResponse {
  return {
    status: 503,
    body: {
      error: {
        code: "service_unavailable",
        message: "链接读取服务暂时不可用。",
        requestId: "memory-starmap-link-failure",
      },
    },
  };
}

function readMultipartField(body: string, fieldName: string): string | null {
  return body.match(new RegExp(`name="${fieldName}"\\r?\\n\\r?\\n([^\\r\\n]+)`, "u"))?.[1] ?? null;
}

async function initializeStarmap(context: BrowserContext, page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
}

async function openCreateMode(page: Page, mode: "链接" | "图片"): Promise<Locator> {
  await page.getByRole("button", { name: "记录内容", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "记录此刻" });
  await expect(createDialog).toHaveAttribute("data-appearance", "starmap");
  await createDialog.getByRole("button", { name: mode, exact: true }).click();
  const modeDialog = page.getByRole("dialog", { name: "记录此刻" });
  await expect(modeDialog).toBeVisible();
  return modeDialog;
}

async function selectImage(imageDialog: Locator, name: string): Promise<void> {
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(imageDialog.getByAltText("待保存的图片预览")).toBeVisible();
}

async function exportMemoryStarmapBackup(page: Page): Promise<Download> {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog", { name: "设置" })
    .getByRole("button", { name: /^数据备份/u })
    .click();
  const dialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(dialog).toHaveAttribute("data-appearance", "starmap");
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出备份", exact: true }).click();
  const download = await downloadPromise;
  await expect(dialog.getByText("备份已经导出。请妥善保存下载的文件。")).toBeVisible();
  return download;
}

async function requireDownloadPath(download: Download): Promise<string> {
  const path = await download.path();
  if (path === null) throw new Error("Playwright did not provide a backup download path.");
  return path;
}

async function expectCompactPreviewContentWithinBounds(preview: Locator): Promise<void> {
  const bottomOverflow = await preview.evaluate((root) => {
    const content = root.querySelector<HTMLElement>(".memory-star-detail-preview-content");
    const excerpt = root.querySelector<HTMLElement>(".memory-star-detail-preview-excerpt");
    if (content === null || excerpt === null) {
      throw new Error("Compact preview content is missing.");
    }

    return excerpt.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom;
  });

  expect(bottomOverflow).toBeLessThanOrEqual(1);
}

async function readProcessingStarTarget(
  transition: Locator,
): Promise<Readonly<{ clientX: number; clientY: number }>> {
  const [rawClientX, rawClientY] = await Promise.all([
    transition.getAttribute("data-target-client-x"),
    transition.getAttribute("data-target-client-y"),
  ]);
  const clientX = Number(rawClientX);
  const clientY = Number(rawClientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    throw new Error("The completed processing transition did not resolve a real star target.");
  }
  return { clientX, clientY };
}

test("keeps link jobs out of the starmap until provider success and rejects false success", async ({
  context,
  page,
}) => {
  const providerGate = createDeferred();
  const trace = await mockLinkImportRoutes(page, {
    onStart: async ({ callIndex }) => {
      if (callIndex === 1) {
        await providerGate.promise;
        return completedLinkResponse();
      }
      return failedLinkResponse();
    },
    onProgress: () => {
      throw new Error("Immediate provider responses must not be polled.");
    },
  });
  await initializeStarmap(context, page);

  const linkDialog = await openCreateMode(page, "链接");
  await linkDialog.getByLabel("链接或分享内容").fill(LINK_SHARE_TEXT);
  await linkDialog.getByLabel("补充内容（可选）").fill(LINK_NOTE);
  await expect(linkDialog.getByLabel("标题（可选）")).toHaveCount(0);
  await expect(linkDialog.getByText("新的链接记录", { exact: true })).toHaveCount(0);
  await expect(
    linkDialog.getByText("链接会先进入整理任务，读取成功后才会成为正式笔记和记忆星。"),
  ).toHaveCount(0);
  await expect(
    linkDialog.getByText(
      "提交后会先整理链接内容。整理成功才会创建正式笔记和记忆星；失败时不会留下空记录。",
    ),
  ).toHaveCount(0);
  await linkDialog.getByRole("button", { name: "开始整理", exact: true }).click();
  const disclosure = page.getByRole("dialog", { name: "读取链接前，请先确认" });
  await expect(disclosure).toHaveAttribute("data-appearance", "starmap");
  await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();

  await expect.poll(() => trace.startUrls.length).toBe(1);
  expect(trace.startUrls).toEqual([LINK_URL]);
  const transition = page.getByTestId("record-processing-morph");
  await expect(transition).toHaveAttribute("data-processing-kind", "link");
  await expect(transition).toHaveAttribute("data-processing-phase", "processing");
  await expect(
    transition.locator(".memory-record-processing-transition__black-hole"),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "正在整理的内容" })).toHaveCount(0);
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toMatch(/^(pending|processing)$/u);
  let state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toEqual([]);
  expect(state.plants).toEqual([]);
  expect(state.contentProcessingJobs[0]?.createdFragmentId).toBeNull();
  expect(state.contentProcessingJobs[0]?.sourceUrl).toBe(LINK_URL);
  expect(state.contentProcessingJobs[0]?.userNoteMarkdown).toContain(LINK_NOTE);
  await expect(page.getByTestId("record-save-morph")).toHaveCount(0);
  await expect(page.getByText("0 颗记忆星", { exact: true })).toBeVisible();

  providerGate.release();
  await expect(transition).toHaveAttribute("data-processing-phase", "star");
  state = await readFragmentGardenPersistence(page);
  const createdFragmentId = state.fragments[0]?.id;
  expect(createdFragmentId).toBeTruthy();
  await expect(transition).toHaveAttribute("data-star-fragment-id", createdFragmentId ?? "");
  const target = await readProcessingStarTarget(transition);
  await expect(transition).toBeHidden();
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();
  state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(1);
  expect(state.plants).toHaveLength(1);
  expect(state.externalLinkImports).toHaveLength(1);

  await page.mouse.click(target.clientX, target.clientY);
  const preview = page.getByRole("dialog", { name: LINK_TITLE });
  await expectCompactPreviewContentWithinBounds(preview);
  await preview.getByRole("button", { name: "展开详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: LINK_TITLE });
  await expect(detail).toHaveAttribute("data-appearance", "starmap");
  await expect(detail.getByText(LINK_SUMMARY, { exact: true })).toBeVisible();
  await expect(detail.getByText(LINK_CONTENT, { exact: true })).toBeVisible();
  await expect(detail.getByText(LINK_NOTE, { exact: true })).toBeVisible();
  await expect(
    detail.getByRole("region", { name: "原链接" }).getByRole("link", { name: LINK_URL }),
  ).toHaveAttribute("href", LINK_URL);
  await detail.getByRole("button", { name: "关闭详情", exact: true }).click();

  const failedDialog = await openCreateMode(page, "链接");
  await failedDialog.getByLabel("链接或分享内容").fill(`分享给你：${FAILED_LINK_URL} 请查收`);
  await failedDialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect.poll(() => trace.startUrls.length).toBe(2);
  await expect
    .poll(async () => {
      const current = await readFragmentGardenPersistence(page);
      return current.contentProcessingJobs.find((job) => job.sourceUrl === FAILED_LINK_URL)?.status;
    })
    .toBe("failed");
  const failedTransition = page.getByTestId("record-processing-morph");
  await expect(failedTransition).toHaveAttribute("data-processing-phase", "failed");
  await expect(failedTransition).not.toHaveAttribute("data-star-fragment-id", /.+/u);

  state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(1);
  expect(state.plants).toHaveLength(1);
  expect(state.externalLinkImports).toHaveLength(1);
  await failedTransition.getByRole("button", { name: "稍后再试", exact: true }).click();
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("reopens a background link task with the same black-hole state", async ({ context, page }) => {
  const providerGate = createDeferred();
  await mockLinkImportRoutes(page, {
    onStart: async () => {
      await providerGate.promise;
      return completedLinkResponse();
    },
    onProgress: () => {
      throw new Error("Immediate provider responses must not be polled.");
    },
  });
  await initializeStarmap(context, page);

  const linkDialog = await openCreateMode(page, "链接");
  await linkDialog.getByLabel("链接或分享内容").fill(LINK_URL);
  await linkDialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await page
    .getByRole("dialog", { name: "读取链接前，请先确认" })
    .getByRole("button", { name: "同意并继续", exact: true })
    .click();

  const foregroundTransition = page.getByTestId("record-processing-morph");
  await expect(foregroundTransition).toHaveAttribute("data-processing-phase", "processing");
  await foregroundTransition.getByRole("button", { name: "转入后台", exact: true }).click();
  await expect(foregroundTransition).toBeHidden();

  await page.getByRole("button", { name: "正在整理 1", exact: true }).click();
  const taskDialog = page.locator("dialog.memory-processing-dialog");
  await expect(taskDialog).toBeVisible();
  await expect(taskDialog).toHaveAttribute("data-appearance", "starmap");
  await expect(taskDialog).toContainText("一颗记忆星正在形成");
  const taskVisual = taskDialog.getByTestId("starmap-processing-visual");
  await expect(taskVisual).toHaveAttribute("data-processing-visual-state", /^(active|waiting)$/u);
  await expect(taskVisual.locator(".memory-processing-visual__black-hole")).toBeVisible();
  await expect(page.getByText("0 颗记忆星", { exact: true })).toBeVisible();
  let state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toEqual([]);
  expect(state.contentProcessingJobs).toHaveLength(1);

  providerGate.release();
  await expect(taskVisual).toHaveAttribute("data-processing-visual-state", "completed");
  await expect(taskDialog.getByRole("button", { name: "查看这颗星", exact: true })).toBeVisible();
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();
  state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(1);
  expect(state.contentProcessingJobs[0]?.createdFragmentId).toBe(state.fragments[0]?.id);

  await taskDialog.getByRole("button", { name: "查看这颗星", exact: true }).click();
  await expect(taskDialog).toBeHidden();
  const preview = page.getByRole("dialog", { name: LINK_TITLE });
  await expect(preview).toBeVisible();
  await expectCompactPreviewContentWithinBounds(preview);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("moves an analyzed image Blob into one content star and keeps failures temporary", async ({
  context,
  page,
}) => {
  const providerGate = createDeferred();
  let requestCount = 0;
  await page.route("**/api/media/image/analyze", async (route: Route) => {
    requestCount += 1;
    if (requestCount > 1) {
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: "request_timeout",
            message: "图片分析暂时超时。",
            requestId: "memory-starmap-image-failure",
          },
        }),
        contentType: "application/json",
        status: 504,
      });
      return;
    }

    const body = route.request().postDataBuffer()?.toString("utf8") ?? "";
    const clientRequestId = readMultipartField(body, "clientRequestId");
    await providerGate.promise;
    await route.fulfill({
      body: JSON.stringify({
        requestId: "00000000-0000-4000-8000-000000000041",
        clientRequestId,
        analysis: {
          title: IMAGE_TITLE,
          markdown: IMAGE_MARKDOWN,
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await initializeStarmap(context, page);

  const imageDialog = await openCreateMode(page, "图片");
  await selectImage(imageDialog, "window-light.png");
  await expect(imageDialog.getByLabel("标题（可选）")).toHaveCount(0);
  await imageDialog.getByLabel("补充内容（可选）").fill(IMAGE_NOTE);
  await imageDialog.getByRole("button", { name: "开始整理", exact: true }).click();
  const disclosure = page.getByRole("dialog", { name: "发送当前图片前，请先确认" });
  await expect(disclosure).toHaveAttribute("data-appearance", "starmap");
  await disclosure.getByRole("button", { name: "同意并分析", exact: true }).click();

  await expect.poll(() => requestCount).toBe(1);
  const transition = page.getByTestId("record-processing-morph");
  await expect(transition).toHaveAttribute("data-processing-kind", "image");
  await expect(transition).toHaveAttribute("data-processing-phase", "processing");
  await expect(
    transition.locator(".memory-record-processing-transition__black-hole"),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "正在整理的内容" })).toHaveCount(0);
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("processing");
  let state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toEqual([]);
  expect(state.mediaAssets).toEqual([]);
  expect(state.contentProcessingJobs[0]).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    createdFragmentId: null,
    kind: "image",
  });
  await expect(page.getByTestId("record-save-morph")).toHaveCount(0);
  await expect(page.getByText("0 颗记忆星", { exact: true })).toBeVisible();

  providerGate.release();
  await expect(transition).toHaveAttribute("data-processing-phase", "star");
  state = await readFragmentGardenPersistence(page);
  const createdFragmentId = state.fragments[0]?.id;
  expect(createdFragmentId).toBeTruthy();
  await expect(transition).toHaveAttribute("data-star-fragment-id", createdFragmentId ?? "");
  const target = await readProcessingStarTarget(transition);
  await expect(transition).toBeHidden();
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();
  state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(1);
  expect(state.mediaAssets).toHaveLength(1);
  expect(state.contentProcessingJobs).toEqual([]);
  expect(state.mediaAssets[0]).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    fragmentId: state.fragments[0]?.id,
    kind: "image",
    processingStatus: "completed",
  });

  await page.mouse.click(target.clientX, target.clientY);
  const preview = page.getByRole("dialog", { name: IMAGE_TITLE });
  await expectCompactPreviewContentWithinBounds(preview);
  await preview.getByRole("button", { name: "展开详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: IMAGE_TITLE });
  await expect(detail).toHaveAttribute("data-appearance", "starmap");
  await expect(detail.getByAltText(`用户上传的图片：${IMAGE_TITLE}`)).toBeVisible();
  await expect(detail.getByText(IMAGE_NOTE, { exact: true })).toBeVisible();

  await detail.getByText("查看大图", { exact: true }).click();
  const imagePreview = page.locator(".memory-image-preview-dialog");
  await expect(imagePreview).toBeVisible();
  await expect(imagePreview).toHaveAttribute("data-appearance", "starmap");
  await imagePreview.getByRole("button", { name: "关闭图片预览", exact: true }).click();
  await expect(imagePreview).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(detail.getByText(IMAGE_NOTE, { exact: true })).toBeVisible();

  await detail.getByRole("button", { name: "关闭详情", exact: true }).click();

  const failedImageDialog = await openCreateMode(page, "图片");
  await selectImage(failedImageDialog, "failed-image.png");
  await failedImageDialog.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect.poll(() => requestCount).toBe(2);
  await expect
    .poll(async () => {
      const current = await readFragmentGardenPersistence(page);
      return current.contentProcessingJobs.find((job) => job.sourceFileName === "failed-image.png")
        ?.status;
    })
    .toBe("failed");
  const failedTransition = page.getByTestId("record-processing-morph");
  await expect(failedTransition).toHaveAttribute("data-processing-phase", "failed");
  await expect(failedTransition).not.toHaveAttribute("data-star-fragment-id", /.+/u);

  state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(1);
  expect(state.mediaAssets).toHaveLength(1);
  expect(
    state.contentProcessingJobs.find((job) => job.sourceFileName === "failed-image.png"),
  ).toMatchObject({
    blobSize: PNG_BYTES.byteLength,
    createdFragmentId: null,
    status: "failed",
  });
  await failedTransition.getByRole("button", { name: "稍后再试", exact: true }).click();
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("restores stars, note brightness inputs, and image content from a complete backup", async ({
  context,
  page,
}) => {
  await initializeStarmap(context, page);
  await seedGardenBackupFixture(page);
  await page.reload();
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await expect(page.getByText("3 颗记忆星", { exact: true })).toBeVisible();

  await page.getByText("星星列表", { exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(BACKUP_SOURCE_TITLE) })).toContainText(
    "追加 2",
  );
  const backupPath = await requireDownloadPath(await exportMemoryStarmapBackup(page));

  await clearAllGardenTables(page);
  await page.reload();
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await expect(page.getByText("0 颗记忆星", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog", { name: "设置" })
    .getByRole("button", { name: /^数据备份/u })
    .click();
  const backupDialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(backupDialog).toHaveAttribute("data-appearance", "starmap");
  await backupDialog.getByLabel("选择碎片宇宙备份文件").setInputFiles(backupPath);
  await expect(backupDialog.getByText("备份检查通过。确认前不会修改当前星空档案。")).toBeVisible();
  await expect(backupDialog.getByText("笔记", { exact: true }).locator("..")).toContainText("3");
  await expect(backupDialog.getByText("图片", { exact: true }).locator("..")).toContainText("1");
  await expect(backupDialog.getByText("追加笔记", { exact: true }).locator("..")).toContainText(
    "2",
  );

  await backupDialog.getByRole("button", { name: "用这份备份恢复", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "用备份替换当前星空档案？" });
  await expect(confirmation).toHaveAttribute("data-appearance", "starmap");
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await confirmation.getByRole("button", { name: "确认恢复", exact: true }).click();
  await navigation;

  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await expect(page.getByText("3 颗记忆星", { exact: true })).toBeVisible();
  await page.getByText("星星列表", { exact: true }).click();
  const sourceStar = page.getByRole("button", { name: new RegExp(BACKUP_SOURCE_TITLE) });
  await expect(sourceStar).toContainText("追加 2");
  await sourceStar.click();
  const sourcePreview = page.getByRole("dialog", { name: BACKUP_SOURCE_TITLE });
  await sourcePreview.getByRole("button", { name: "展开详情", exact: true }).click();
  const sourceDetail = page.getByRole("dialog", { name: BACKUP_SOURCE_TITLE });
  await expect(sourceDetail.getByText("第一条恢复用追加笔记。", { exact: true })).toBeVisible();
  await expect(sourceDetail.getByText("第二条恢复用追加笔记。", { exact: true })).toBeVisible();
  await sourceDetail.getByRole("button", { name: "关闭详情", exact: true }).click();

  await page.getByRole("button", { name: new RegExp(BACKUP_IMAGE_TITLE) }).click();
  const imagePreview = page.getByRole("dialog", { name: BACKUP_IMAGE_TITLE });
  await imagePreview.getByRole("button", { name: "展开详情", exact: true }).click();
  const imageDetail = page.getByRole("dialog", { name: BACKUP_IMAGE_TITLE });
  await expect(imageDetail.getByAltText(`用户上传的图片：${BACKUP_IMAGE_TITLE}`)).toBeVisible();

  const restored = await readFragmentGardenPersistence(page);
  expect(restored.fragments.map((fragment) => fragment.id).sort()).toEqual([
    "backup-child",
    "backup-image",
    "backup-source",
  ]);
  expect(restored.fragmentNotes).toHaveLength(2);
  expect(restored.mediaAssets).toHaveLength(1);
  expect(restored.mediaAssets[0]?.blobSize).toBeGreaterThan(0);
  await expect(page.locator("canvas")).toHaveCount(1);
});
