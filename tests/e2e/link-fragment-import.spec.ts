import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded, expectSingleCompanion } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";
import { mockLinkImportRoutes, type LinkImportMockResponse } from "./helpers/link-import-mocks";

const SOURCE_URL = "https://example.com/articles/quiet-garden?utm_source=e2e";
const SECOND_SOURCE_URL = "https://example.org/articles/failed-garden";
const IMPORTED_TITLE = "把安静角落整理成一座小花园";
const IMPORTED_SUMMARY = "一篇关于整理阳台角落并种下耐阴植物的笔记。";
const IMPORTED_CONTENT = "先清理角落，再根据日照选择植物。保留一把椅子，让这里也能用来阅读。";

type Deferred = Readonly<{
  promise: Promise<void>;
  release: () => void;
}>;

function requireBaseURL(): string {
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

function completedResponse(title = IMPORTED_TITLE): LinkImportMockResponse {
  return {
    body: {
      status: "completed",
      externalNoteId: "90071992547409931234",
      title,
      summary: IMPORTED_SUMMARY,
      sourceContent: IMPORTED_CONTENT,
      canonicalUrl: "https://example.com/articles/quiet-garden",
      truncated: false,
      requestId: "request-link-completed",
    },
  };
}

function failedResponse(callIndex: number): LinkImportMockResponse {
  return {
    status: 503,
    body: {
      error: {
        code: "service_unavailable",
        message: "链接读取服务暂时不可用。",
        requestId: `request-link-failed-${callIndex}`,
      },
    },
  };
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "种下碎片", exact: true })).toBeVisible();
}

async function openLinkCreator(page: Page): Promise<ReturnType<Page["getByRole"]>> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "链接", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "种下链接碎片" });
  await expect(linkDialog).toBeVisible();
  return linkDialog;
}

async function submitLink(
  page: Page,
  sourceUrl: string,
  options: Readonly<{ expectDisclosure?: boolean; title?: string }> = {},
): Promise<void> {
  const linkDialog = page.getByRole("dialog", { name: "种下链接碎片" });
  await linkDialog.getByLabel("链接地址").fill(sourceUrl);
  if (options.title !== undefined) {
    await linkDialog.getByLabel("标题（可选）").fill(options.title);
  }
  await linkDialog.getByRole("button", { name: "开始整理", exact: true }).click();

  const disclosure = page.getByRole("dialog", { name: "读取链接前，请先确认" });
  if (options.expectDisclosure !== false) {
    await expect(disclosure).toBeVisible();
    await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();
  } else {
    await expect(disclosure).toBeHidden();
  }
}

async function expectNoFormalContent(page: Page): Promise<void> {
  const state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toEqual([]);
  expect(state.plants).toEqual([]);
  expect(state.fragmentEvents).toEqual([]);
  expect(state.externalLinkImports).toEqual([]);
  expect(state.mediaAssets).toEqual([]);
  await expect(page.getByRole("button", { name: /^打开笔记：/u })).toHaveCount(0);
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "0",
  );
}

async function expectAtMostOneCanvas(page: Page): Promise<void> {
  await expect.poll(async () => page.locator("canvas").count()).toBeLessThanOrEqual(1);
}

test("link processing job creates no card until mocked provider success", async ({
  context,
  page,
}) => {
  const providerGate = createDeferred();
  const trace = await mockLinkImportRoutes(page, {
    onStart: async () => {
      await providerGate.promise;
      return completedResponse();
    },
    onProgress: () => {
      throw new Error("Immediate completion must not poll the provider");
    },
  });
  await initializeGarden(context, page);

  const linkDialog = await openLinkCreator(page);
  await linkDialog.getByLabel("链接地址").fill(SOURCE_URL);
  await linkDialog.getByRole("button", { name: "开始整理", exact: true }).click();
  const disclosure = page.getByRole("dialog", { name: "读取链接前，请先确认" });
  await expect(disclosure).toBeVisible();

  await test.step("disclosure cancellation sends nothing and creates no task", async () => {
    await disclosure.getByRole("button", { name: "取消", exact: true }).click();
    await expect(disclosure).toBeHidden();
    expect(trace.startUrls).toEqual([]);
    expect((await readFragmentGardenPersistence(page)).contentProcessingJobs).toEqual([]);
    await expectNoFormalContent(page);
  });

  await test.step("accepted submission stores only a processing job", async () => {
    await linkDialog.getByRole("button", { name: "开始整理", exact: true }).click();
    await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();
    await expect.poll(() => trace.startUrls.length).toBe(1);
    await expect
      .poll(
        async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status,
      )
      .toMatch(/^(pending|processing)$/u);

    const state = await readFragmentGardenPersistence(page);
    expect(state.contentProcessingJobs).toHaveLength(1);
    expect(state.contentProcessingJobs[0]).toMatchObject({
      blobSize: 0,
      createdFragmentId: null,
      kind: "link",
      normalizedSourceUrl: "https://example.com/articles/quiet-garden",
      sourceUrl: SOURCE_URL,
      status: expect.stringMatching(/^(pending|processing)$/u),
    });
    expect(state.getNoteDisclosureAcceptedAt).not.toBeNull();
    await expectNoFormalContent(page);
    await expectAtMostOneCanvas(page);
  });

  await test.step("provider success atomically creates one readable note", async () => {
    const jobId = (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.id;
    providerGate.release();
    await expect
      .poll(
        async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status,
      )
      .toBe("completed");

    const state = await readFragmentGardenPersistence(page);
    expect(state.fragments).toHaveLength(1);
    expect(state.plants).toHaveLength(1);
    expect(state.externalLinkImports).toHaveLength(1);
    expect(state.mediaAssets).toEqual([]);
    expect(state.fragmentEvents.filter((event) => event.type === "created")).toHaveLength(1);
    expect(state.contentProcessingJobs).toHaveLength(1);
    expect(state.contentProcessingJobs[0]).toMatchObject({
      createdFragmentId: state.fragments[0]?.id,
      id: jobId,
      status: "completed",
    });
    expect(state.fragments[0]?.contentMarkdown).toContain(IMPORTED_SUMMARY);
    expect(state.fragments[0]?.contentMarkdown).toContain(IMPORTED_CONTENT);

    const processingDialog = page.getByRole("dialog", { name: "正在整理的内容" });
    await processingDialog.getByRole("button", { name: "查看笔记", exact: true }).click();
    const detail = page.getByRole("dialog", { name: IMPORTED_TITLE });
    await expect(detail.getByText(IMPORTED_SUMMARY, { exact: true })).toBeVisible();
    await expect(detail.getByText(IMPORTED_CONTENT, { exact: true })).toBeVisible();
    const sourceLink = detail.getByRole("link", { name: "打开原链接", exact: true });
    await expect(sourceLink).toHaveAttribute("href", SOURCE_URL);
    await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(detail).not.toContainText(/处理状态|读取结果|provider|taskId|成长分|生命周期/u);
    await expectAtMostOneCanvas(page);
  });

  expect(trace.progressTaskIds).toEqual([]);
});

test("failed link job retries in place and a separate failed task can be removed", async ({
  context,
  page,
}) => {
  let shouldSucceed = false;
  const trace = await mockLinkImportRoutes(page, {
    onStart: ({ callIndex }) => (shouldSucceed ? completedResponse() : failedResponse(callIndex)),
    onProgress: () => {
      throw new Error("Failed start requests must not poll the provider");
    },
  });
  await initializeGarden(context, page);
  await openLinkCreator(page);
  await submitLink(page, SOURCE_URL);

  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("failed");
  const failedState = await readFragmentGardenPersistence(page);
  const retryJobId = failedState.contentProcessingJobs[0]?.id;
  expect(retryJobId).toBeTruthy();
  await expectNoFormalContent(page);

  shouldSucceed = true;
  const processingDialog = page.getByRole("dialog", { name: "正在整理的内容" });
  await processingDialog.getByRole("button", { name: "重试", exact: true }).click();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toBe("completed");

  const retriedState = await readFragmentGardenPersistence(page);
  expect(retriedState.contentProcessingJobs).toHaveLength(1);
  expect(retriedState.contentProcessingJobs[0]?.id).toBe(retryJobId);
  expect(retriedState.fragments).toHaveLength(1);
  expect(retriedState.plants).toHaveLength(1);
  expect(retriedState.externalLinkImports).toHaveLength(1);
  expect(retriedState.fragmentEvents.filter((event) => event.type === "created")).toHaveLength(1);

  await processingDialog.getByRole("button", { name: "关闭", exact: true }).click();
  shouldSucceed = false;
  await openLinkCreator(page);
  await submitLink(page, SECOND_SOURCE_URL, { expectDisclosure: false });
  await expect
    .poll(async () => {
      const state = await readFragmentGardenPersistence(page);
      return state.contentProcessingJobs.find((job) => job.sourceUrl === SECOND_SOURCE_URL)?.status;
    })
    .toBe("failed");

  const beforeDelete = await readFragmentGardenPersistence(page);
  const failedJob = beforeDelete.contentProcessingJobs.find(
    (job) => job.sourceUrl === SECOND_SOURCE_URL,
  );
  expect(failedJob).toBeDefined();
  expect(beforeDelete.fragments).toHaveLength(1);
  expect(beforeDelete.plants).toHaveLength(1);

  await processingDialog
    .getByRole("listitem")
    .filter({ hasText: "example.org" })
    .getByRole("button", { name: "删除任务", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", { name: "删除这条整理任务？" });
  await confirmation.getByRole("button", { name: "删除任务", exact: true }).click();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs.length)
    .toBe(1);

  const afterDelete = await readFragmentGardenPersistence(page);
  expect(afterDelete.contentProcessingJobs[0]?.id).toBe(retryJobId);
  expect(afterDelete.fragments).toHaveLength(1);
  expect(afterDelete.plants).toHaveLength(1);
  expect(afterDelete.externalLinkImports).toHaveLength(1);
  expect(trace.startUrls).toEqual([SOURCE_URL, SOURCE_URL, SECOND_SOURCE_URL]);
  await expect(page.getByRole("button", { name: /^打开笔记：/u })).toHaveCount(1);
  await expectAtMostOneCanvas(page);
});

test("NPC new-idea action reuses the delayed link processing flow", async ({ context, page }) => {
  const providerGate = createDeferred();
  await mockLinkImportRoutes(page, {
    onStart: async () => {
      await providerGate.promise;
      return completedResponse("伙伴入口整理出的笔记");
    },
    onProgress: () => {
      throw new Error("Immediate completion must not poll the provider");
    },
  });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await expectSingleCompanion(page, "cat");
  const chatMessageCountBefore = (await readFragmentGardenPersistence(page)).chatMessages.length;

  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  const npc = page.getByRole("dialog", { name: "花园伙伴" });
  await npc.getByRole("button", { name: "帮我种下一个新想法", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "链接", exact: true }).click();
  await submitLink(page, SOURCE_URL);

  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).contentProcessingJobs[0]?.status)
    .toMatch(/^(pending|processing)$/u);
  await expectNoFormalContent(page);
  providerGate.release();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).fragments.length)
    .toBe(1);
  await expect(page.getByRole("button", { name: "打开笔记：伙伴入口整理出的笔记" })).toBeVisible();
  expect((await readFragmentGardenPersistence(page)).chatMessages).toHaveLength(
    chatMessageCountBefore,
  );
  await expectAtMostOneCanvas(page);
});
