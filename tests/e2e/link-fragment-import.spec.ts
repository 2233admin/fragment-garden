import { expect, test, type Locator, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded, expectSingleCompanion } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";
import { mockLinkImportRoutes, type LinkImportMockResponse } from "./helpers/link-import-mocks";

const SOURCE_URL = "https://example.com/articles/quiet-garden?utm_source=e2e";
const TEMPORARY_TITLE = "来自 example.com 的链接";
const IMPORTED_TITLE = "把安静角落整理成一座小花园";
const IMPORTED_SUMMARY = "一篇关于整理阳台角落并种下耐阴植物的笔记。";
const IMPORTED_CONTENT = "先清理角落，再根据日照选择植物。保留一把椅子，让这里也能用来阅读。";
const USER_EDITED_CONTENT = "这是我在读取失败后补写的正文，后续重试不能覆盖。";

type RuntimeObservations = {
  pageErrors: string[];
  realGetNoteRequests: string[];
};

type Deferred = {
  promise: Promise<void>;
  release: () => void;
};

type StoredLinkContentState = Readonly<{
  fragment: Readonly<{
    contentMarkdown: string;
    id: string;
    rawText: string | null;
    title: string;
  }>;
  externalLinkImport: Readonly<{
    attemptCount: number;
    sourceContent: string | null;
    status: string;
    userProvidedContent: boolean;
    userProvidedTitle: boolean;
  }>;
}>;

function requireBaseURL(): string {
  const baseURL = test.info().project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("The Playwright project must define a baseURL.");
  }

  return baseURL;
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    release: () => resolvePromise?.(),
  };
}

function observeRuntime(page: Page): RuntimeObservations {
  const observations: RuntimeObservations = {
    pageErrors: [],
    realGetNoteRequests: [],
  };

  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("request", (request) => {
    try {
      if (new URL(request.url()).hostname === "openapi.biji.com") {
        observations.realGetNoteRequests.push(request.url());
      }
    } catch {
      observations.realGetNoteRequests.push(request.url());
    }
  });

  return observations;
}

function expectCleanRuntime(observations: RuntimeObservations): void {
  expect(observations.pageErrors).toEqual([]);
  expect(observations.realGetNoteRequests).toEqual([]);
}

function pendingStartResponse(taskId: string): LinkImportMockResponse {
  return {
    status: 202,
    body: {
      status: "pending",
      taskId,
      requestId: `request-${taskId}`,
    },
  };
}

function completedProgressResponse(title = IMPORTED_TITLE): LinkImportMockResponse {
  return {
    body: {
      status: "completed",
      externalNoteId: "90071992547409931234",
      title,
      summary: IMPORTED_SUMMARY,
      sourceContent: IMPORTED_CONTENT,
      canonicalUrl: "https://example.com/articles/quiet-garden",
      truncated: false,
      requestId: "request-progress-completed",
    },
  };
}

function failedProgressResponse(callIndex: number): LinkImportMockResponse {
  return {
    status: 502,
    body: {
      error: {
        code: "provider_processing_failed",
        message: `得到大脑第 ${callIndex} 次没有读完这个链接。`,
        requestId: `request-progress-failed-${callIndex}`,
      },
    },
  };
}

async function openCardMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function acceptLinkDisclosureAndOpenForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const textDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await expect(textDialog).toBeVisible();
  await textDialog.getByRole("button", { name: "链接", exact: true }).click();

  const disclosure = page.getByRole("dialog", {
    name: "读取链接前，请先确认",
  });
  await expect(disclosure).toBeVisible();
  await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();
  await expect(disclosure).toBeHidden();
  await expect(page.getByRole("dialog", { name: "种下链接碎片" })).toBeVisible();
}

async function submitLinkForm(page: Page): Promise<void> {
  const linkDialog = page.getByRole("dialog", { name: "种下链接碎片" });
  await linkDialog.getByLabel("链接地址").fill(SOURCE_URL);
  await expect(linkDialog.getByLabel("标题（可选）")).toHaveValue("");
  await linkDialog.getByRole("button", { name: "种下链接", exact: true }).click();
  await expect(linkDialog).toBeHidden();
}

function getFragmentCard(page: Page, title: string) {
  return page.getByRole("button", { name: `打开笔记：${title}` }).locator("xpath=ancestor::li");
}

async function expectAtMostOneCanvas(page: Page): Promise<void> {
  await expect.poll(async () => page.locator("canvas").count()).toBeLessThanOrEqual(1);
}

async function expectContentFirstCard(card: Locator): Promise<void> {
  await expect(card.getByText("正在读取", { exact: true })).toHaveCount(0);
  await expect(card.getByText("读取失败", { exact: true })).toHaveCount(0);
  await expect(card.getByText("已完成", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("link", { name: "打开原链接", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "重新读取", exact: true })).toHaveCount(0);
}

async function expectContentFirstLinkDetail(detail: Locator): Promise<void> {
  await expect(detail.getByRole("button", { name: "返回", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "编辑", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "删除", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "追加笔记", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "发芽", exact: true })).toBeVisible();
  await expect(detail.getByRole("complementary", { name: "链接来源" })).toContainText(
    "example.com",
  );

  await expect(detail.getByText(/成长分|成长阶段|生命周期|处理状态/u)).toHaveCount(0);
  await expect(detail.getByText("种下了这条碎片", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("来源与读取结果", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("正在读取", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("读取失败", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("已完成", { exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "重新读取", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "标记完成", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "封存", exact: true })).toHaveCount(0);
}

async function readStoredLinkContentState(page: Page): Promise<StoredLinkContentState> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(["fragments", "externalLinkImports"], "readonly");
    const readAll = <T>(storeName: string): Promise<T[]> =>
      new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      });
    const [fragments, externalLinkImports] = await Promise.all([
      readAll<{
        contentMarkdown?: string;
        contentType: string;
        id: string;
        rawText: string | null;
        title: string;
      }>("fragments"),
      readAll<{
        attemptCount: number;
        fragmentId: string;
        sourceContent: string | null;
        status: string;
        userProvidedContent: boolean;
        userProvidedTitle: boolean;
      }>("externalLinkImports"),
    ]);
    const fragment = fragments.find((candidate) => candidate.contentType === "link");
    const externalLinkImport = externalLinkImports.find(
      (candidate) => candidate.fragmentId === fragment?.id,
    );

    database.close();
    if (fragment === undefined || externalLinkImport === undefined) {
      throw new Error("The link Fragment or its ExternalLinkImport was not found");
    }

    return {
      fragment: {
        contentMarkdown: fragment.contentMarkdown ?? "",
        id: fragment.id,
        rawText: fragment.rawText,
        title: fragment.title,
      },
      externalLinkImport: {
        attemptCount: externalLinkImport.attemptCount,
        sourceContent: externalLinkImport.sourceContent,
        status: externalLinkImport.status,
        userProvidedContent: externalLinkImport.userProvidedContent,
        userProvidedTitle: externalLinkImport.userProvidedTitle,
      },
    };
  });
}

test("link form saves locally before mocked GetNote completes and remembers disclosure", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  const progressGate = createDeferred();
  const trace = await mockLinkImportRoutes(page, {
    onStart: ({ callIndex }) => pendingStartResponse(`success-task-${callIndex}`),
    onProgress: async () => {
      await progressGate.promise;
      return completedProgressResponse();
    },
  });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await openCardMode(page);

  await test.step("cancelling the first disclosure creates nothing and calls no route", async () => {
    await page.getByRole("button", { name: "种下碎片", exact: true }).click();
    const textDialog = page.getByRole("dialog", {
      name: "种下文字碎片",
    });
    await textDialog.getByRole("button", { name: "链接", exact: true }).click();
    const disclosure = page.getByRole("dialog", {
      name: "读取链接前，请先确认",
    });
    await expect(disclosure).toBeVisible();
    await disclosure.getByRole("button", { name: "取消", exact: true }).click();
    await expect(disclosure).toBeHidden();

    const state = await readFragmentGardenPersistence(page);
    expect(state.fragments).toEqual([]);
    expect(state.plants).toEqual([]);
    expect(state.externalLinkImports).toEqual([]);
    expect(trace.startUrls).toEqual([]);
    expect(trace.progressTaskIds).toEqual([]);
  });

  await test.step("accepting creates the card and plant before progress resolves", async () => {
    const textDialog = page.getByRole("dialog", {
      name: "种下文字碎片",
    });
    await textDialog.getByRole("button", { name: "链接", exact: true }).click();
    const disclosure = page.getByRole("dialog", {
      name: "读取链接前，请先确认",
    });
    await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();
    await submitLinkForm(page);

    const temporaryCard = getFragmentCard(page, TEMPORARY_TITLE);
    await expect(temporaryCard).toBeVisible();
    await expect(temporaryCard.getByText("example.com", { exact: true })).toBeVisible();
    await expectContentFirstCard(temporaryCard);
    await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
      "data-plant-count",
      "1",
    );
    await expectAtMostOneCanvas(page);
    await expect.poll(() => trace.startUrls.length).toBe(1);
    await expect.poll(() => trace.progressTaskIds.length).toBe(1);

    const pendingState = await readFragmentGardenPersistence(page);
    expect(pendingState.fragments).toHaveLength(1);
    expect(pendingState.plants).toHaveLength(1);
    expect(pendingState.externalLinkImports).toHaveLength(1);
    expect(pendingState.fragments[0]).toMatchObject({
      analysisStatus: "pending",
      contentType: "link",
      sourceUrl: SOURCE_URL,
      title: TEMPORARY_TITLE,
    });
    expect(pendingState.externalLinkImports[0]?.status).toBe("processing");
    expect(pendingState.getNoteDisclosureAcceptedAt).not.toBeNull();
  });

  await test.step("an untouched pending detail follows the mocked completion", async () => {
    const temporaryCard = getFragmentCard(page, TEMPORARY_TITLE);
    await temporaryCard.getByRole("button", { name: `打开笔记：${TEMPORARY_TITLE}` }).click();

    const pendingDetail = page.getByRole("dialog", { name: TEMPORARY_TITLE });
    await expectContentFirstLinkDetail(pendingDetail);
    await expect(pendingDetail.getByRole("textbox", { name: "标题", exact: true })).toHaveCount(0);
    const pendingSourceLink = pendingDetail.getByRole("link", {
      name: "打开原链接",
      exact: true,
    });
    await expect(pendingSourceLink).toHaveAttribute("href", SOURCE_URL);
    await expect(pendingSourceLink).toHaveAttribute("target", "_blank");
    await expect(pendingSourceLink).toHaveAttribute("rel", "noopener noreferrer");
    await expectAtMostOneCanvas(page);

    progressGate.release();
    const completedDetail = page.getByRole("dialog", { name: IMPORTED_TITLE });
    await expect(completedDetail).toBeVisible();
    await expect(completedDetail.getByText(IMPORTED_SUMMARY, { exact: true })).toBeVisible();
    await expect(completedDetail.getByText(IMPORTED_CONTENT, { exact: true })).toBeVisible();
    await expectContentFirstLinkDetail(completedDetail);

    await completedDetail.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(completedDetail.getByRole("textbox", { name: "标题", exact: true })).toHaveValue(
      IMPORTED_TITLE,
    );
    const bodyEditor = completedDetail.getByRole("textbox", {
      name: "编辑主体内容",
      exact: true,
    });
    await expect(bodyEditor).toContainText(IMPORTED_CONTENT);
    await expect(bodyEditor).toContainText(IMPORTED_SUMMARY);
    await completedDetail.getByRole("button", { name: "取消", exact: true }).click();
    await completedDetail.getByRole("button", { name: "返回", exact: true }).click();
  });

  await test.step("mocked completion updates the shared card and detail", async () => {
    const completedCard = getFragmentCard(page, IMPORTED_TITLE);
    await expect(completedCard).toBeVisible();
    await expect(completedCard.getByText("example.com", { exact: true })).toBeVisible();
    await expect(completedCard).toContainText(IMPORTED_CONTENT);
    await expectContentFirstCard(completedCard);
    await completedCard.getByRole("button", { name: `打开笔记：${IMPORTED_TITLE}` }).click();

    const detail = page.getByRole("dialog", { name: IMPORTED_TITLE });
    await expect(detail.getByText(IMPORTED_SUMMARY, { exact: true })).toBeVisible();
    await expect(detail.getByText(IMPORTED_CONTENT, { exact: true })).toBeVisible();
    await expectContentFirstLinkDetail(detail);
    const sourceLink = detail.getByRole("link", { name: "打开原链接", exact: true });
    await expect(sourceLink).toHaveAttribute("href", SOURCE_URL);
    await expect(sourceLink).toHaveAttribute("target", "_blank");
    await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
    await detail.getByRole("button", { name: "返回", exact: true }).click();
    await expectAtMostOneCanvas(page);
  });

  await test.step("reload keeps content and does not repeat disclosure", async () => {
    await page.reload();
    await completeCompanionOnboardingIfNeeded(page);
    await openCardMode(page);
    const completedCard = getFragmentCard(page, IMPORTED_TITLE);
    await expect(completedCard).toBeVisible();
    await expectContentFirstCard(completedCard);
    await expectAtMostOneCanvas(page);

    await page.getByRole("button", { name: "种下碎片", exact: true }).click();
    const textDialog = page.getByRole("dialog", {
      name: "种下文字碎片",
    });
    await textDialog.getByRole("button", { name: "链接", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "种下链接碎片" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "读取链接前，请先确认" })).toBeHidden();
    await page
      .getByRole("dialog", { name: "种下链接碎片" })
      .getByRole("button", { name: "取消", exact: true })
      .click();

    const persisted = await readFragmentGardenPersistence(page);
    expect(persisted.fragments).toHaveLength(1);
    expect(persisted.plants).toHaveLength(1);
    expect(persisted.externalLinkImports).toHaveLength(1);
    expect(persisted.fragments[0]).toMatchObject({
      analysisStatus: "completed",
      rawText: IMPORTED_CONTENT,
      summary: IMPORTED_SUMMARY,
      title: IMPORTED_TITLE,
    });
    expect(persisted.externalLinkImports[0]?.status).toBe("completed");
    const storedContent = await readStoredLinkContentState(page);
    expect(storedContent.fragment.contentMarkdown).toContain(IMPORTED_CONTENT);
    expect(storedContent.fragment.contentMarkdown).toContain(IMPORTED_SUMMARY);
    expect(storedContent.externalLinkImport.sourceContent).toBe(IMPORTED_CONTENT);
  });

  expectCleanRuntime(observations);
});

test("failed link remains local after automatic retry and protects unified user edits", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  const trace = await mockLinkImportRoutes(page, {
    onStart: ({ callIndex }) => pendingStartResponse(`retry-task-${callIndex}`),
    onProgress: ({ callIndex }) => failedProgressResponse(callIndex),
  });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await openCardMode(page);
  await acceptLinkDisclosureAndOpenForm(page);
  await submitLinkForm(page);

  const failedCard = getFragmentCard(page, TEMPORARY_TITLE);
  await expect(failedCard).toBeVisible();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).externalLinkImports[0]?.status)
    .toBe("failed");
  await expect.poll(() => trace.startUrls.length).toBe(2);
  await expect.poll(() => trace.progressTaskIds.length).toBe(2);
  await expect(failedCard.getByText("example.com", { exact: true })).toBeVisible();
  await expectContentFirstCard(failedCard);
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "1",
  );
  await expectAtMostOneCanvas(page);

  const failedState = await readFragmentGardenPersistence(page);
  expect(failedState.fragments).toHaveLength(1);
  expect(failedState.plants).toHaveLength(1);
  expect(failedState.externalLinkImports).toHaveLength(1);
  expect(failedState.fragments[0]).toMatchObject({
    analysisStatus: "failed",
    sourceUrl: SOURCE_URL,
  });
  expect(failedState.externalLinkImports[0]).toMatchObject({
    attemptCount: 2,
    status: "failed",
  });

  await failedCard.getByRole("button", { name: `打开笔记：${TEMPORARY_TITLE}` }).click();
  const failedDetail = page.getByRole("dialog", { name: TEMPORARY_TITLE });
  await expectContentFirstLinkDetail(failedDetail);
  const sourceLink = failedDetail.getByRole("link", { name: "打开原链接", exact: true });
  await expect(sourceLink).toHaveAttribute("href", SOURCE_URL);
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");

  await failedDetail.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(failedDetail.getByRole("textbox", { name: "标题", exact: true })).toHaveValue(
    TEMPORARY_TITLE,
  );
  await failedDetail
    .getByRole("textbox", { name: "编辑主体内容", exact: true })
    .fill(USER_EDITED_CONTENT);
  await failedDetail.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(failedDetail.getByText("标题和主体内容已保存。", { exact: true })).toBeVisible();
  await expect(failedDetail.getByText(USER_EDITED_CONTENT, { exact: true })).toBeVisible();
  await expectContentFirstLinkDetail(failedDetail);

  const editedState = await readStoredLinkContentState(page);
  expect(editedState.fragment).toMatchObject({
    rawText: null,
    title: TEMPORARY_TITLE,
  });
  expect(editedState.fragment.contentMarkdown).toContain(USER_EDITED_CONTENT);
  expect(editedState.externalLinkImport).toMatchObject({
    attemptCount: 2,
    sourceContent: null,
    status: "failed",
    userProvidedContent: true,
    userProvidedTitle: false,
  });

  await failedDetail.getByRole("button", { name: "返回", exact: true }).click();
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  await openCardMode(page);
  const refreshedCard = getFragmentCard(page, TEMPORARY_TITLE);
  await expect(refreshedCard).toContainText(USER_EDITED_CONTENT);
  await expectContentFirstCard(refreshedCard);
  await refreshedCard.getByRole("button", { name: `打开笔记：${TEMPORARY_TITLE}` }).click();
  const refreshedDetail = page.getByRole("dialog", { name: TEMPORARY_TITLE });
  await expect(refreshedDetail.getByText(USER_EDITED_CONTENT, { exact: true })).toBeVisible();
  await expectContentFirstLinkDetail(refreshedDetail);
  expect(trace.startUrls).toHaveLength(2);
  expect(trace.progressTaskIds).toHaveLength(2);
  await expectAtMostOneCanvas(page);
  expectCleanRuntime(observations);
});

test("NPC new-idea action reuses the existing link creation flow", async ({ context, page }) => {
  const observations = observeRuntime(page);
  const trace = await mockLinkImportRoutes(page, {
    onStart: ({ callIndex }) => pendingStartResponse(`npc-task-${callIndex}`),
    onProgress: () => completedProgressResponse(),
  });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await expectSingleCompanion(page, "cat");
  await expectAtMostOneCanvas(page);

  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  const npc = page.getByRole("dialog", { name: "花园伙伴" });
  await npc.getByRole("button", { name: "帮我种下一个新想法", exact: true }).click();

  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("button", { name: "链接", exact: true }).click();
  const disclosure = page.getByRole("dialog", {
    name: "读取链接前，请先确认",
  });
  await expect(disclosure).toBeVisible();
  await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();

  const linkDialog = page.getByRole("dialog", { name: "种下链接碎片" });
  await linkDialog.getByLabel("链接地址").fill(SOURCE_URL);
  await linkDialog.getByRole("button", { name: "种下链接", exact: true }).click();

  await expect(linkDialog).toBeHidden();
  await expect(page.getByTestId("garden-interaction-status")).toContainText(
    "已经种下了。以后再回来看看，它也许会慢慢长出新的方向。",
  );
  await expect.poll(() => trace.startUrls.length).toBe(1);
  await expect.poll(() => trace.progressTaskIds.length).toBe(1);
  await expectAtMostOneCanvas(page);

  const detail = page.getByRole("dialog", { name: IMPORTED_TITLE });
  const card = page.getByRole("button", { name: `打开笔记：${IMPORTED_TITLE}` });
  await expect(card).toBeVisible();
  await card.click();
  await expect(detail).toBeVisible();
  await expect(detail.getByText(IMPORTED_SUMMARY, { exact: true })).toBeVisible();
  await expect(detail.getByText(IMPORTED_CONTENT, { exact: true })).toBeVisible();
  await expectContentFirstLinkDetail(detail);
  const sourceLink = detail.getByRole("link", { name: "打开原链接", exact: true });
  await expect(sourceLink).toHaveAttribute("href", SOURCE_URL);
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
  await detail.getByRole("button", { name: "返回", exact: true }).click();

  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  await expectAtMostOneCanvas(page);

  const persisted = await readFragmentGardenPersistence(page);
  expect(persisted.fragments).toHaveLength(1);
  expect(persisted.plants).toHaveLength(1);
  expect(persisted.externalLinkImports).toHaveLength(1);
  expect(persisted.chatMessages.some((message) => message.content.includes("链接已经先种下"))).toBe(
    false,
  );
  expectCleanRuntime(observations);
});
