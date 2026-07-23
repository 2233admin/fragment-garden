import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const FIRST_TITLE = "窗边的小花圃";
const SECOND_TITLE = "雨天散步清单";
const SUPPLEMENT_TEXT = "先画出花盆和窗台的位置。";

async function clearIndexedDb(context: BrowserContext, page: Page): Promise<void> {
  const baseURL = test.info().project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("The Playwright project must define a baseURL.");
  }

  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("Storage.clearDataForOrigin", {
    origin: new URL(baseURL).origin,
    storageTypes: "indexeddb",
  });
  await cdpSession.detach();
}

async function selectMode(page: Page, mode: "花园模式" | "卡片模式"): Promise<void> {
  const button = page.getByRole("button", { name: mode, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function createTextFragment(page: Page, title: string, content: string): Promise<void> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await dialog.getByLabel("标题（可选）").fill(title);
  await dialog.getByLabel("内容").fill(content);
  await dialog.getByRole("button", { name: "种下", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `打开碎片：${title}` })).toBeVisible();
}

async function expectGardenPlantCount(page: Page, count: number): Promise<void> {
  const summary = page.getByTestId("garden-accessibility-summary");
  await expect(summary).toHaveAttribute("data-plant-count", String(count));
  await expect(summary).toContainText(`花园中有 ${count} 株已放置植物`);
  await expect(page.getByTestId("garden-canvas-host").locator("canvas")).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(1);
}

test("renders and synchronizes local plants in the fixed garden", async ({ context, page }) => {
  await clearIndexedDb(context, page);

  await test.step("1. 默认进入花园并只创建一个 Canvas", async () => {
    await page.goto("/garden");
    await completeCompanionOnboardingIfNeeded(page);
    await expect(page.getByRole("heading", { name: "碎片花园" })).toBeVisible();
    await expect(page.getByRole("button", { name: "花园模式", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectGardenPlantCount(page, 0);
  });

  await test.step("2. 在卡片模式创建第一条碎片", async () => {
    await selectMode(page, "卡片模式");
    await expect(page.locator("canvas")).toHaveCount(0);
    await createTextFragment(page, FIRST_TITLE, "想把窗边整理成一个小花圃。");
  });

  await test.step("3. 返回花园后第一株植物出现", async () => {
    await selectMode(page, "花园模式");
    await expectGardenPlantCount(page, 1);
  });

  await test.step("4. 创建第二条碎片后花园实时增加植物", async () => {
    await selectMode(page, "卡片模式");
    await expect(page.locator("canvas")).toHaveCount(0);
    await createTextFragment(page, SECOND_TITLE, "下雨时也想去附近安静地走一圈。");
    await page.getByLabel("搜索碎片").fill("雨天");
    await selectMode(page, "花园模式");
    await expectGardenPlantCount(page, 2);
  });

  await test.step("5. 模式切换保留搜索，文字补充同步更新植物阶段", async () => {
    await selectMode(page, "卡片模式");
    await expect(page.getByLabel("搜索碎片")).toHaveValue("雨天");
    await page.getByLabel("搜索碎片").fill("");
    await page.getByRole("button", { name: `打开碎片：${FIRST_TITLE}` }).click();
    const detailDialog = page.getByRole("dialog", { name: FIRST_TITLE });
    await detailDialog.getByLabel("添加新补充").fill(SUPPLEMENT_TEXT);
    await detailDialog.getByRole("button", { name: "保存补充" }).click();
    await expect(detailDialog.getByText(/成长阶段\s*[：:]\s*(生长|growing)/i)).toBeVisible();
    await detailDialog.getByRole("button", { name: "关闭详情" }).click();

    await selectMode(page, "花园模式");
    await expectGardenPlantCount(page, 2);
    const firstPlantSummary = page
      .locator('[aria-label="花园植物"] li')
      .filter({ hasText: FIRST_TITLE });
    await expect(firstPlantSummary).toHaveAttribute("data-stage", "growing");
    await expect(firstPlantSummary).toContainText("生长");
  });

  await test.step("6. 软删除后对应植物从花园移除", async () => {
    await selectMode(page, "卡片模式");
    await page.getByRole("button", { name: `打开碎片：${SECOND_TITLE}` }).click();
    const detailDialog = page.getByRole("dialog", { name: SECOND_TITLE });
    await detailDialog.getByRole("button", { name: "删除碎片" }).click();
    const confirmDialog = page.getByRole("alertdialog", { name: "确认删除碎片" });
    await confirmDialog.getByRole("button", { name: "确认删除", exact: true }).click();
    await expect(page.getByRole("button", { name: `打开碎片：${SECOND_TITLE}` })).toHaveCount(0);

    await selectMode(page, "花园模式");
    await expectGardenPlantCount(page, 1);
  });
});
