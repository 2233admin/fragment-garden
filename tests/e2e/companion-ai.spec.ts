import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { clearFragmentGardenIndexedDb } from "./helpers/indexed-db";
import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const BASE_URL = "http://localhost:3000";
const TEST_LINK = "https://example.com/ai-companion-link";
const OLD_FRAGMENT_ID = "ai-old-fragment";

async function preparePage(context: BrowserContext, page: Page): Promise<void> {
  await page.goto("/garden");
  await clearFragmentGardenIndexedDb(context, page, BASE_URL);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page, "cat");
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "花园伙伴" })).toBeVisible();
}

async function enableAi(page: Page): Promise<void> {
  const chat = page.getByRole("dialog", { name: "花园伙伴" });
  await chat.getByTestId("companion-request-ai").click();
  const disclosure = page.getByRole("dialog", { name: "使用 AI 花园伙伴前，请先确认" });
  await expect(disclosure).toBeVisible();
  await disclosure.getByRole("button", { name: "同意并继续", exact: true }).click();
  await expect(disclosure).toBeHidden();
  await expect(chat.getByTestId("companion-mode")).toContainText("AI 模式");
}

async function send(page: Page, content: string, expectMessage = true): Promise<void> {
  const chat = page.getByRole("dialog", { name: "花园伙伴" });
  await chat.getByLabel("想问些什么？").fill(content);
  await chat.getByRole("button", { name: "发送", exact: true }).click();
  if (expectMessage) {
    await expect(chat.getByText(content, { exact: true })).toBeVisible();
  }
}

async function seedOldFragment(page: Page): Promise<void> {
  await page.evaluate(async (fragmentId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const timestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1_000).toISOString();
    const transaction = database.transaction(["fragments", "plants", "settings"], "readwrite");
    transaction.objectStore("settings").put({
      id: "local-user",
      onboardingCompleted: true,
      companionType: "cat",
      lastOpenedAt: null,
      lastRecommendationDate: `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1,
      ).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
      getNoteDisclosureAcceptedAt: null,
      schemaVersion: 1,
    });
    transaction.objectStore("fragments").put({
      id: fragmentId,
      contentType: "text",
      title: "以前的一条想法",
      rawText: "一条可以重新回看的想法。",
      sourceUrl: null,
      summary: null,
      keywords: [],
      lifecycleStatus: "dormant",
      completionStatus: "open",
      analysisStatus: "not_required",
      embedding: null,
      parentFragmentId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastInteractedAt: timestamp,
      completedAt: null,
    });
    transaction.objectStore("plants").put({
      id: `plant-${fragmentId}`,
      fragmentId,
      speciesId: null,
      stage: "seedling",
      vitality: "dormant",
      growthScore: 0,
      slotId: "slot-01",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, OLD_FRAGMENT_ID);
}

test("AI mode saves a local user message and one assistant response", async ({ context, page }) => {
  await page.route("**/api/companion/respond", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ type: "message", message: "这是一次模拟的 AI 回复。" }),
    });
  });
  await preparePage(context, page);
  await enableAi(page);
  await send(page, "这座花园怎么使用？");
  const chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.getByText("这是一次模拟的 AI 回复。", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "花园伙伴" })).toContainText(
    "这是一次模拟的 AI 回复。",
  );
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("AI recommendation and open tools use the shared detail dialog", async ({ context, page }) => {
  let callCount = 0;
  await page.route("**/api/companion/respond", async (route) => {
    callCount += 1;
    const body =
      callCount === 1
        ? { type: "tool_call", callId: "recommend-1", name: "recommend_fragment", arguments: {} }
        : {
            type: "tool_call",
            callId: "open-1",
            name: "open_fragment",
            arguments: { fragmentId: OLD_FRAGMENT_ID },
          };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await preparePage(context, page);
  await seedOldFragment(page);
  await page.reload();
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  await enableAi(page);
  await send(page, "推荐一条以前的想法");
  const chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.locator(`[data-fragment-id="${OLD_FRAGMENT_ID}"]`)).toBeVisible();
  await send(page, "打开它", false);
  await expect(page.getByRole("dialog", { name: "以前的一条想法" })).toBeVisible();
  expect(callCount).toBe(2);
});

test("AI import_link uses the existing disclosure and local-first flow", async ({
  context,
  page,
}) => {
  await page.route("**/api/companion/respond", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "tool_call",
        callId: "import-1",
        name: "import_link",
        arguments: { url: TEST_LINK, title: null },
      }),
    });
  });
  await page.route("**/api/link-imports/start", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ status: "pending", taskId: "mock-task", requestId: null }),
    });
  });
  await page.route("**/api/link-imports/progress", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "processing", requestId: null }),
    });
  });
  await preparePage(context, page);
  await enableAi(page);
  await send(page, `帮我种下这个链接 ${TEST_LINK}`, false);
  const getNoteDisclosure = page.getByRole("dialog", { name: "读取链接前，请先确认" });
  await expect(getNoteDisclosure).toBeVisible();
  await getNoteDisclosure.getByRole("button", { name: "同意并继续", exact: true }).click();
  await expect(getNoteDisclosure).toBeHidden();
  await expect
    .poll(
      async () =>
        await page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("fragment-garden");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
          });
          const transaction = database.transaction(["fragments", "plants"], "readonly");
          const fragments = await new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore("fragments").getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as unknown[]);
          });
          const plants = await new Promise<unknown[]>((resolve, reject) => {
            const request = transaction.objectStore("plants").getAll();
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result as unknown[]);
          });
          database.close();
          return fragments.length >= 1 && plants.length >= 1;
        }),
    )
    .toBe(true);
});

test("AI rate-limit error offers basic mode without duplicating the user message", async ({
  context,
  page,
}) => {
  await page.route("**/api/companion/respond", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "rate_limited", message: "busy" } }),
    });
  });
  await preparePage(context, page);
  await enableAi(page);
  await send(page, "植物怎么才能开花？");
  const chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.getByText("AI 请求暂时较多，请稍后重试。", { exact: true })).toBeVisible();
  await chat.getByRole("button", { name: "使用基础模式", exact: true }).click();
  await expect(chat.getByText(/当前版本支持文字补充/)).toBeVisible();
  await expect(chat.getByText("植物怎么才能开花？", { exact: true })).toHaveCount(1);
});
