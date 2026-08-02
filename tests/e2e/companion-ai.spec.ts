import { expect, test, type Page } from "@playwright/test";

import { clearFragmentGardenIndexedDb } from "./helpers/indexed-db";
import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

async function setHistoricalOpenAiMode(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction("settings", "readwrite");
    const store = transaction.objectStore("settings");

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      const request = store.get("local-user");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const settings = request.result as Record<string, unknown> | undefined;
        if (settings === undefined) {
          reject(new Error("Expected onboarding settings"));
          return;
        }

        store.put({
          ...settings,
          companionAiMode: "openai",
          openAiDisclosureAcceptedAt: new Date().toISOString(),
        });
      };
    });

    database.close();
  });
}

test("NPC path hides open chat controls and never calls the AI route", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required");
  let companionRouteCalls = 0;
  await page.route("**/api/companion/respond", async (route) => {
    companionRouteCalls += 1;
    await route.abort();
  });

  await page.goto("/garden");
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page, "cat");
  await setHistoricalOpenAiMode(page);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page, "cat");
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();

  const npc = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(npc).toBeVisible();
  await expect(npc.getByText("花园中的伙伴", { exact: true })).toBeVisible();
  await expect(
    npc.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }),
  ).toBeVisible();
  await expect(npc.getByRole("button", { name: "看看我的花园近况", exact: true })).toBeVisible();
  await expect(npc.getByRole("button", { name: "帮我种下一个新想法", exact: true })).toBeVisible();
  await expect(npc.getByRole("button", { name: "更多", exact: true })).toBeVisible();
  await expect(npc.locator("input")).toHaveCount(0);
  await expect(npc.getByRole("button", { name: "发送", exact: true })).toHaveCount(0);
  await expect(npc.getByText("AI 模式", { exact: true })).toHaveCount(0);
  await expect(npc.getByText("基础模式", { exact: true })).toHaveCount(0);

  await npc.getByRole("button", { name: "更多", exact: true }).click();
  await expect(
    npc.getByRole("button", { name: "看看哪些植物正在休眠", exact: true }),
  ).toBeVisible();
  await expect(
    npc.getByRole("button", { name: "告诉我植物为什么会成长", exact: true }),
  ).toBeVisible();
  await npc.getByRole("button", { name: "返回", exact: true }).click();
  await expect(npc.getByRole("button", { name: "更多", exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(npc).toBeHidden();
  expect(companionRouteCalls).toBe(0);

  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  const reopenedNpc = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(
    reopenedNpc.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }),
  ).toBeVisible();
  await expect(reopenedNpc.getByRole("button", { name: "更多", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("cat and dog use the same fixed NPC labels", async ({ context, page }) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required");
  await page.goto("/garden");
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page, "dog");
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();

  const npc = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(
    npc.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }),
  ).toBeVisible();
  await expect(npc.getByRole("button", { name: "看看我的花园近况", exact: true })).toBeVisible();
  await expect(npc.getByRole("button", { name: "帮我种下一个新想法", exact: true })).toBeVisible();
  await expect(npc.getByRole("button", { name: "更多", exact: true })).toBeVisible();
  await expect(npc.getByRole("button", { name: "离开", exact: true })).toBeVisible();
  await expect(npc.getByRole("button", { name: "关闭花园伙伴", exact: true })).toBeVisible();
});
