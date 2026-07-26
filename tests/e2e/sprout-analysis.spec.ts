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

const SOURCE_TITLE = "周末社区阅读角";
const SOURCE_BODY = "想在社区做一个周末阅读角，让六位邻居围绕一篇短文展开交流。";
const SOURCE_NOTE = "第一次先选择十分钟内可以读完的文章。";
const GENERATED_TITLE = "一次轻量的社区阅读试办";
const GENERATED_MARKDOWN = "## 试办方式\n\n先邀请六位邻居，共读一篇短文。";
const EDITED_TITLE = "六人社区阅读试办";
const EDITED_MARKDOWN = "编辑后的完整正文。";
const IMAGE_TITLE = "白板上的活动安排";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";

type GenerateRequest = {
  source: {
    contentMarkdown: string;
    existingSproutTitles: string[];
    id: string;
    notes: Array<{ contentMarkdown: string; createdAt: string }>;
    sourceName: string | null;
    sourceType: "text" | "link" | "image" | "voice";
    title: string;
  };
};

type NetworkObservations = {
  analyzeRequests: number;
  companionRequests: number;
  generateRequests: number;
  pageErrors: string[];
};

function baseUrl(): string {
  const value = test.info().project.use.baseURL;
  if (typeof value !== "string") throw new Error("Missing Playwright baseURL");
  return value;
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, baseUrl());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

function observeNetwork(page: Page): NetworkObservations {
  const observations: NetworkObservations = {
    analyzeRequests: 0,
    companionRequests: 0,
    generateRequests: 0,
    pageErrors: [],
  };
  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/sprout/generate") observations.generateRequests += 1;
    if (path === "/api/sprout/analyze") observations.analyzeRequests += 1;
    if (path === "/api/companion/respond") observations.companionRequests += 1;
  });
  return observations;
}

async function blockLegacyRoutes(page: Page): Promise<void> {
  await page.route("**/api/sprout/analyze", async (route) => {
    await route.fulfill({ body: "unexpected legacy sprout request", status: 500 });
  });
  await page.route("**/api/companion/respond", async (route) => {
    await route.fulfill({ body: "unexpected companion request", status: 500 });
  });
}

async function setSproutDisclosure(
  page: Page,
  value: string | null,
  openAiValue: string | null = null,
): Promise<void> {
  await page.evaluate(
    async ({ acceptedAt, openAiAcceptedAt }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("settings", "readwrite");
        const store = transaction.objectStore("settings");
        const request = store.get("local-user");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (request.result === undefined) {
            reject(new Error("Local settings were not initialized"));
            return;
          }
          store.put({
            ...(request.result as Record<string, unknown>),
            openAiDisclosureAcceptedAt: openAiAcceptedAt,
            sproutAiDisclosureAcceptedAt: acceptedAt,
          });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { acceptedAt: value, openAiAcceptedAt: openAiValue },
  );
}

async function createTextFragment(page: Page): Promise<void> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await dialog.getByLabel("标题（可选）").fill(SOURCE_TITLE);
  await dialog.getByLabel("内容").fill(SOURCE_BODY);
  await dialog.getByRole("button", { name: "种下", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function openFragment(page: Page, title: string): Promise<Locator> {
  await page.getByRole("button", { name: `打开笔记：${title}` }).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function appendSourceNote(detail: Locator): Promise<void> {
  await detail.getByRole("button", { name: "追加笔记", exact: true }).click();
  await detail.getByLabel("追加笔记内容").fill(SOURCE_NOTE);
  await detail.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(detail.getByText(SOURCE_NOTE, { exact: true })).toBeVisible();
}

async function openSprout(detail: Locator): Promise<Locator> {
  await detail.getByRole("button", { name: "发芽", exact: true }).click();
  const dialog = detail.page().getByRole("dialog", { name: "生成一条新笔记" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fulfillGeneratedNote(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify({ title: GENERATED_TITLE, markdown: GENERATED_MARKDOWN }),
    contentType: "application/json",
    status: 200,
  });
}

async function expectCleanBoundary(page: Page, observations: NetworkObservations): Promise<void> {
  expect(observations.analyzeRequests).toBe(0);
  expect(observations.companionRequests).toBe(0);
  expect(observations.pageErrors).toEqual([]);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
}

test("generates an editable preview and creates one linked note only after confirmation", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  const requests: GenerateRequest[] = [];
  let releaseProvider!: () => void;
  const providerGate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  await blockLegacyRoutes(page);
  await page.route("**/api/sprout/generate", async (route) => {
    requests.push(route.request().postDataJSON() as GenerateRequest);
    await providerGate;
    await fulfillGeneratedNote(route);
  });

  await initializeGarden(context, page);
  await setSproutDisclosure(page, null, "2026-07-25T07:00:00.000Z");
  await createTextFragment(page);
  const detail = await openFragment(page, SOURCE_TITLE);
  await appendSourceNote(detail);
  const sourceBefore = (await readFragmentGardenPersistence(page)).fragments.find(
    (fragment) => fragment.title === SOURCE_TITLE,
  );

  let sprout = await openSprout(detail);
  const disclosure = page.getByRole("dialog", { name: "生成新笔记前，请先确认" });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText("不会发送花园中的其他碎片、伙伴建议、原始图片或原始音频");
  await disclosure.getByRole("button", { name: "暂不使用 AI", exact: true }).click();
  await expect(disclosure).toBeHidden();
  await expect(sprout).toBeHidden();
  expect(observations.generateRequests).toBe(0);
  let persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(1);
  expect(persistence.contentProcessingJobs).toHaveLength(0);

  sprout = await openSprout(detail);
  const reopenedDisclosure = page.getByRole("dialog", { name: "生成新笔记前，请先确认" });
  await reopenedDisclosure.getByRole("button", { name: "同意并生成", exact: true }).click();
  await expect(reopenedDisclosure).toBeHidden();
  await expect(sprout.getByText("正在发芽…", { exact: true })).toBeVisible();
  await expect.poll(() => observations.generateRequests).toBe(1);

  persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(1);
  expect(persistence.plants).toHaveLength(1);
  expect(persistence.fragmentRelations).toHaveLength(0);
  expect(persistence.contentProcessingJobs).toEqual([
    expect.objectContaining({
      kind: "sprout",
      status: "processing",
      createdFragmentId: null,
    }),
  ]);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.source).toMatchObject({
    title: SOURCE_TITLE,
    contentMarkdown: SOURCE_BODY,
    notes: [{ contentMarkdown: SOURCE_NOTE }],
    sourceType: "text",
  });
  expect(requests[0]?.source).not.toHaveProperty("partnerSuggestions");

  releaseProvider();
  await expect(sprout.getByRole("heading", { name: "新笔记预览" })).toBeVisible();
  await expect(sprout.locator('input[id^="sprout-title-"]')).toHaveValue(GENERATED_TITLE);
  await expect(sprout.getByLabel("新笔记正文")).toContainText("先邀请六位邻居");

  await sprout.locator('input[id^="sprout-title-"]').fill(EDITED_TITLE);
  await sprout.getByLabel("新笔记正文").fill(EDITED_MARKDOWN);
  await sprout.getByRole("button", { name: "确认种下", exact: true }).click();
  await expect(sprout.getByRole("heading", { name: "新的笔记已经种下" })).toBeVisible();

  persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(2);
  expect(persistence.plants).toHaveLength(2);
  expect(persistence.fragmentRelations).toHaveLength(1);
  const sourceAfter = persistence.fragments.find((fragment) => fragment.title === SOURCE_TITLE);
  const generated = persistence.fragments.find((fragment) => fragment.title === EDITED_TITLE);
  expect(sourceAfter).toMatchObject({
    rawText: sourceBefore?.rawText,
    contentMarkdown: sourceBefore?.contentMarkdown,
  });
  expect(generated).toMatchObject({
    contentType: "text",
    contentMarkdown: expect.stringContaining(EDITED_MARKDOWN),
  });
  expect(generated?.contentMarkdown).not.toContain("先邀请六位邻居");
  expect(persistence.fragmentRelations[0]).toMatchObject({
    sourceFragmentId: generated?.id,
    targetFragmentId: sourceAfter?.id,
    relationType: "grows_from",
    status: "confirmed",
  });
  expect(
    persistence.fragmentEvents.filter((event) => event.type === "child_fragment_created"),
  ).toEqual([]);
  expect(
    persistence.fragmentEvents.filter((event) => event.type === "partner_suggestion_saved"),
  ).toEqual([]);

  await sprout.getByRole("button", { name: "查看新笔记", exact: true }).click();
  const childDetail = page.getByRole("dialog", { name: EDITED_TITLE });
  await expect(childDetail).toBeVisible();
  await childDetail.getByRole("button", { name: `发芽自「${SOURCE_TITLE}」` }).click();
  const sourceDetail = page.getByRole("dialog", { name: SOURCE_TITLE });
  await expect(sourceDetail).toBeVisible();
  await expect(sourceDetail.getByText("从这里发芽出了 1 条新笔记", { exact: true })).toBeVisible();
  await sourceDetail.getByRole("button", { name: `查看「${EDITED_TITLE}」` }).click();
  await expect(page.getByRole("dialog", { name: EDITED_TITLE })).toBeVisible();

  expect(observations.generateRequests).toBe(1);
  await expectCleanBoundary(page, observations);
});

test("keeps failures and abandoned previews temporary while retrying the same job", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  let attempt = 0;
  await blockLegacyRoutes(page);
  await page.route("**/api/sprout/generate", async (route) => {
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "request_timeout", message: "The request timed out." },
        }),
        contentType: "application/json",
        status: 504,
      });
      return;
    }
    await fulfillGeneratedNote(route);
  });

  await initializeGarden(context, page);
  await setSproutDisclosure(page, "2026-07-25T07:00:00.000Z");
  await createTextFragment(page);
  const detail = await openFragment(page, SOURCE_TITLE);
  const sprout = await openSprout(detail);

  await expect(sprout.getByRole("heading", { name: "这次没有发芽完成" })).toBeVisible();
  let persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(1);
  expect(persistence.plants).toHaveLength(1);
  expect(persistence.fragmentRelations).toHaveLength(0);
  expect(persistence.contentProcessingJobs[0]).toMatchObject({
    status: "failed",
    attemptCount: 1,
    createdFragmentId: null,
  });

  await sprout.getByRole("button", { name: "重试", exact: true }).click();
  await expect(sprout.getByRole("heading", { name: "新笔记预览" })).toBeVisible();
  persistence = await readFragmentGardenPersistence(page);
  expect(persistence.contentProcessingJobs).toHaveLength(1);
  expect(persistence.contentProcessingJobs[0]).toMatchObject({
    status: "awaiting_confirmation",
    attemptCount: 2,
    createdFragmentId: null,
  });
  expect(persistence.fragments).toHaveLength(1);

  await sprout.getByRole("button", { name: "放弃", exact: true }).click();
  await expect(sprout).toBeHidden();
  persistence = await readFragmentGardenPersistence(page);
  expect(persistence.contentProcessingJobs).toHaveLength(1);
  expect(persistence.contentProcessingJobs[0]).toMatchObject({
    status: "cancelled",
    createdFragmentId: null,
  });
  expect(persistence.fragments).toHaveLength(1);
  expect(persistence.plants).toHaveLength(1);
  expect(persistence.fragmentRelations).toHaveLength(0);
  expect(observations.generateRequests).toBe(2);
  await expectCleanBoundary(page, observations);
});

test("uses analyzed image text without sending its Blob or any other fragment", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  const requests: GenerateRequest[] = [];
  let rawRequest = "";
  await blockLegacyRoutes(page);
  await page.route("**/api/sprout/generate", async (route) => {
    rawRequest = route.request().postData() ?? "";
    requests.push(route.request().postDataJSON() as GenerateRequest);
    await fulfillGeneratedNote(route);
  });

  await initializeGarden(context, page);
  await setSproutDisclosure(page, "2026-07-25T07:00:00.000Z");
  await page.evaluate(
    async ({ fragmentId, title }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(
        ["fragments", "plants", "mediaAssets", "fragmentNotes"],
        "readwrite",
      );
      const timestamp = "2026-07-25T08:00:00.000Z";
      transaction.objectStore("fragments").put({
        id: fragmentId,
        contentType: "image",
        title,
        rawText: null,
        sourceUrl: null,
        contentMarkdown: "## 图片内容\n\n白板上写着周六下午三点集合。",
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "completed",
        embedding: null,
        parentFragmentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      });
      transaction.objectStore("plants").put({
        id: "image-plant",
        fragmentId,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId: "slot-01",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const blob = new Blob(["stage13-private-image-bytes"], { type: "image/png" });
      transaction.objectStore("mediaAssets").put({
        id: "image-asset",
        fragmentId,
        kind: "image",
        blob,
        mimeType: "image/png",
        fileName: "stage13-image.png",
        sizeBytes: blob.size,
        width: 640,
        height: 480,
        durationMs: null,
        processingStatus: "completed",
        processingRequestId: null,
        errorCode: null,
        temporaryTitle: null,
        generatedTitle: title,
        summary: "白板上的活动安排。",
        visibleText: "周六下午三点",
        contentKind: "screenshot",
        transcript: null,
        originalTranscript: null,
        transcriptEditedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.objectStore("fragmentNotes").put({
        id: "image-note",
        fragmentId,
        contentMarkdown: "用户补充：地点还没有确定。",
        source: "user",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { fragmentId: IMAGE_ID, title: IMAGE_TITLE },
  );
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();

  const detail = await openFragment(page, IMAGE_TITLE);
  const sprout = await openSprout(detail);
  await expect(sprout.getByRole("heading", { name: "新笔记预览" })).toBeVisible();

  expect(requests).toHaveLength(1);
  expect(requests[0]?.source).toMatchObject({
    id: IMAGE_ID,
    title: IMAGE_TITLE,
    sourceType: "image",
    sourceName: "stage13-image.png",
    contentMarkdown: "## 图片内容\n\n白板上写着周六下午三点集合。",
    notes: [{ contentMarkdown: "用户补充：地点还没有确定。" }],
  });
  expect(rawRequest).not.toContain("stage13-private-image-bytes");
  expect(rawRequest).not.toContain('"blob"');
  expect(rawRequest).not.toContain("其他碎片");
  const persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(1);
  expect(persistence.mediaAssets).toHaveLength(1);
  expect(persistence.contentProcessingJobs[0]).toMatchObject({
    status: "awaiting_confirmation",
    createdFragmentId: null,
  });
  await sprout.getByRole("button", { name: "放弃", exact: true }).click();
  await expectCleanBoundary(page, observations);
});
