import { expect, test, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded, expectSingleCompanion } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";
import { mockLinkImportRoutes, type LinkImportMockResponse } from "./helpers/link-import-mocks";

const SOURCE_URL = "https://example.com/articles/quiet-garden?utm_source=e2e";
const TEMPORARY_TITLE = "来自 example.com 的链接";
const IMPORTED_TITLE = "把安静角落整理成一座小花园";
const IMPORTED_SUMMARY = "一篇关于整理阳台角落并种下耐阴植物的笔记。";
const IMPORTED_CONTENT = "先清理角落，再根据日照选择植物。保留一把椅子，让这里也能用来阅读。";
const USER_EDITED_CONTENT = "这是我在读取失败后补写的正文，后续重试不能覆盖。";
const COMPLETED_COMPANION_MESSAGE = "链接内容读取完成，已经更新到这株植物里。";
const SAVED_COMPANION_MESSAGE = "链接已经先种下了，我正在帮你读取内容。";

type RuntimeObservations = {
  pageErrors: string[];
  realGetNoteRequests: string[];
};

type Deferred = {
  promise: Promise<void>;
  release: () => void;
};

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
  return page
    .getByRole("button", { name: `打开碎片：${title}` })
    .locator("xpath=ancestor::article");
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
    await expect(temporaryCard.getByText("正在读取", { exact: true })).toBeVisible();
    await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
      "data-plant-count",
      "1",
    );
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
    await temporaryCard.getByRole("button", { name: `打开碎片：${TEMPORARY_TITLE}` }).click();

    const pendingDetail = page.getByRole("dialog", { name: TEMPORARY_TITLE });
    const editForm = pendingDetail.locator('form[id^="edit-fragment-"]');
    await expect(editForm.getByLabel("编辑标题")).toHaveValue(TEMPORARY_TITLE);
    await expect(editForm.getByLabel("编辑提取正文（可选）")).toHaveValue("");

    progressGate.release();
    const completedDetail = page.getByRole("dialog", { name: IMPORTED_TITLE });
    const completedEditForm = completedDetail.locator('form[id^="edit-fragment-"]');
    await expect(completedDetail).toBeVisible();
    await expect(completedEditForm.getByLabel("编辑标题")).toHaveValue(IMPORTED_TITLE);
    await expect(completedEditForm.getByLabel("编辑提取正文（可选）")).toHaveValue(
      IMPORTED_CONTENT,
    );
    await completedDetail.getByRole("button", { name: "关闭详情" }).click();
  });

  await test.step("mocked completion updates the shared card and detail", async () => {
    const completedCard = getFragmentCard(page, IMPORTED_TITLE);
    await expect(completedCard).toBeVisible();
    await expect(completedCard.getByText("已完成", { exact: true })).toBeVisible();
    await completedCard.getByRole("button", { name: `打开碎片：${IMPORTED_TITLE}` }).click();

    const detail = page.getByRole("dialog", { name: IMPORTED_TITLE });
    await expect(detail.getByText(IMPORTED_SUMMARY, { exact: true })).toBeVisible();
    await expect(
      detail
        .getByRole("region", { name: "来源与读取结果" })
        .getByText(IMPORTED_CONTENT, { exact: true }),
    ).toBeVisible();
    const sourceLink = detail.getByRole("link", { name: "打开原链接" });
    await expect(sourceLink).toHaveAttribute("target", "_blank");
    await expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
    await detail.getByRole("button", { name: "关闭详情" }).click();
  });

  await test.step("reload keeps content and does not repeat disclosure", async () => {
    await page.reload();
    await completeCompanionOnboardingIfNeeded(page);
    await openCardMode(page);
    await expect(getFragmentCard(page, IMPORTED_TITLE)).toBeVisible();

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
  });

  expectCleanRuntime(observations);
});

test("failed link remains local, retries automatically once, then succeeds manually", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  const trace = await mockLinkImportRoutes(page, {
    onStart: ({ callIndex }) => pendingStartResponse(`retry-task-${callIndex}`),
    onProgress: ({ callIndex }) =>
      callIndex <= 2
        ? failedProgressResponse(callIndex)
        : completedProgressResponse("手动重试后读到的标题"),
  });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await openCardMode(page);
  await acceptLinkDisclosureAndOpenForm(page);
  await submitLinkForm(page);

  const failedCard = getFragmentCard(page, TEMPORARY_TITLE);
  await expect(failedCard.getByText("读取失败", { exact: true })).toBeVisible();
  await expect.poll(() => trace.startUrls.length).toBe(2);
  await expect.poll(() => trace.progressTaskIds.length).toBe(2);
  const sourceLink = failedCard.getByRole("link", { name: "打开原链接" });
  await expect(sourceLink).toHaveAttribute("href", SOURCE_URL);
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "1",
  );

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

  await failedCard.getByRole("button", { name: `打开碎片：${TEMPORARY_TITLE}` }).click();
  const failedDetail = page.getByRole("dialog", { name: TEMPORARY_TITLE });
  const editForm = failedDetail.locator('form[id^="edit-fragment-"]');
  await expect(editForm.getByLabel("编辑标题")).toHaveValue(TEMPORARY_TITLE);
  await editForm.getByLabel("编辑提取正文（可选）").fill(USER_EDITED_CONTENT);
  await editForm.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(
    failedDetail.getByText("链接标题和正文已保存，不会自动重新读取。", { exact: true }),
  ).toBeVisible();
  await failedDetail.getByRole("button", { name: "关闭详情" }).click();

  await failedCard.getByRole("button", { name: "重新读取", exact: true }).click();
  const retriedTitle = "手动重试后读到的标题";
  const completedCard = getFragmentCard(page, retriedTitle);
  await expect(completedCard).toBeVisible();
  await expect(completedCard.getByText("已完成", { exact: true })).toBeVisible();
  await expect.poll(() => trace.startUrls.length).toBe(3);
  await expect.poll(() => trace.progressTaskIds.length).toBe(3);

  const completedState = await readFragmentGardenPersistence(page);
  expect(completedState.fragments).toHaveLength(1);
  expect(completedState.plants).toHaveLength(1);
  expect(completedState.externalLinkImports).toHaveLength(1);
  expect(completedState.fragments[0]).toMatchObject({
    analysisStatus: "completed",
    rawText: USER_EDITED_CONTENT,
    title: retriedTitle,
  });
  expect(completedState.externalLinkImports[0]).toMatchObject({
    attemptCount: 1,
    status: "completed",
    userProvidedContent: true,
    userProvidedTitle: false,
  });

  await completedCard.getByRole("button", { name: `打开碎片：${retriedTitle}` }).click();
  const completedDetail = page.getByRole("dialog", { name: retriedTitle });
  const completedEditForm = completedDetail.locator('form[id^="edit-fragment-"]');
  await expect(completedEditForm.getByLabel("编辑标题")).toHaveValue(retriedTitle);
  await expect(completedEditForm.getByLabel("编辑提取正文（可选）")).toHaveValue(
    USER_EDITED_CONTENT,
  );
  await completedDetail.getByRole("button", { name: "关闭详情" }).click();
  expectCleanRuntime(observations);
});

test("companion IMPORT_LINK uses the same local fragment and persists one completion notice", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  const trace = await mockLinkImportRoutes(page, {
    onStart: ({ callIndex }) => pendingStartResponse(`companion-task-${callIndex}`),
    onProgress: () => completedProgressResponse(),
  });
  await clearFragmentGardenIndexedDb(context, page, requireBaseURL());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await expectSingleCompanion(page, "cat");
  await expect(page.locator("canvas")).toHaveCount(1);

  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  let chat = page.getByRole("dialog", { name: "花园伙伴" });
  await chat.getByLabel("想问些什么？").fill(`帮我种下这个链接 ${SOURCE_URL}`);
  await chat.getByRole("button", { name: "发送", exact: true }).click();

  const disclosure = page.getByRole("dialog", {
    name: "读取链接前，请先确认",
  });
  await expect(disclosure).toBeVisible();
  await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();

  chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat).toBeVisible();
  await expect(chat.getByText(SAVED_COMPANION_MESSAGE, { exact: true })).toBeVisible();
  await expect(chat.getByText(COMPLETED_COMPANION_MESSAGE, { exact: true })).toHaveCount(1);
  await expect.poll(() => trace.startUrls.length).toBe(1);
  await expect.poll(() => trace.progressTaskIds.length).toBe(1);
  await expect(page.locator("canvas")).toHaveCount(1);

  const completionMessage = chat
    .getByText(COMPLETED_COMPANION_MESSAGE, { exact: true })
    .locator("xpath=ancestor::article");
  await completionMessage.getByRole("button", { name: "打开这株植物", exact: true }).click();
  const detail = page.getByRole("dialog", { name: IMPORTED_TITLE });
  await expect(detail).toBeVisible();
  await expect(detail.getByText(IMPORTED_SUMMARY, { exact: true })).toBeVisible();
  await expect(
    detail
      .getByRole("region", { name: "来源与读取结果" })
      .getByText(IMPORTED_CONTENT, { exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "关闭详情" }).click();

  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.getByText(COMPLETED_COMPANION_MESSAGE, { exact: true })).toHaveCount(1);
  await expect(chat.getByText(SAVED_COMPANION_MESSAGE, { exact: true })).toHaveCount(1);

  const persisted = await readFragmentGardenPersistence(page);
  expect(persisted.fragments).toHaveLength(1);
  expect(persisted.plants).toHaveLength(1);
  expect(persisted.externalLinkImports).toHaveLength(1);
  expect(
    persisted.chatMessages.filter((message) => message.content === COMPLETED_COMPANION_MESSAGE),
  ).toHaveLength(1);
  expectCleanRuntime(observations);
});
