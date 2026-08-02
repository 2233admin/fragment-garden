import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { GARDEN_FEATURE_HOTSPOTS } from "../../game/config/garden-feature-hotspots";
import { GARDEN_MAP_CONFIG } from "../../game/config/garden-map";
import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

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

async function clickCanvasWorld(page: Page, worldX: number, worldY: number): Promise<void> {
  const canvas = page.getByTestId("garden-canvas-host").locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const point = await canvas.evaluate(
    (element, target) => {
      const canvasElement = element as HTMLCanvasElement;
      const bounds = canvasElement.getBoundingClientRect();

      return {
        x: bounds.left + target.worldX * (bounds.width / canvasElement.width),
        y: bounds.top + target.worldY * (bounds.height / canvasElement.height),
      };
    },
    { worldX, worldY },
  );

  await page.mouse.click(point.x, point.y);
}

test("uses map interactions for the garden's product entrances", async ({ context, page }) => {
  await clearIndexedDb(context, page);
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("heading", { name: "我的灵感庭院" })).toBeVisible();
  await expect(page.locator(".garden-game-marquee")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);

  await clickCanvasWorld(page, GARDEN_FEATURE_HOTSPOTS.house.x, GARDEN_FEATURE_HOTSPOTS.house.y);
  const houseDialog = page.getByRole("alertdialog", {
    name: "要进入小屋整理笔记吗？",
  });
  await expect(houseDialog).toBeVisible();
  await houseDialog.getByRole("button", { name: "确认进入", exact: true }).click();
  await expect(page.getByRole("heading", { name: "正在进入小屋……" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "木门已经打开……" })).toBeVisible({
    timeout: 1_500,
  });
  await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 3_000 },
  );
  await expect(page.locator("canvas")).toHaveCount(0);

  await page.getByRole("button", { name: "花园模式", exact: true }).click();
  const returnDialog = page.getByRole("dialog", { name: "正在走出小屋……" });
  await expect(returnDialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "庭院已经醒来……" })).toBeVisible({
    timeout: 1_500,
  });
  await expect(returnDialog).toBeHidden({ timeout: 3_000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute("aria-busy", "false");

  await clickCanvasWorld(page, GARDEN_FEATURE_HOTSPOTS.backup.x, GARDEN_FEATURE_HOTSPOTS.backup.y);
  const backupDialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(backupDialog).toBeVisible();
  await backupDialog.getByRole("button", { name: "关闭", exact: true }).click();

  await clickCanvasWorld(
    page,
    GARDEN_MAP_CONFIG.companionPosition.x,
    GARDEN_MAP_CONFIG.companionPosition.y,
  );
  const companionDialog = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(companionDialog).toBeVisible();
  await expect(companionDialog).toHaveClass(/companion-pixel-dialog/u);
  await expect(page.locator("canvas")).toHaveCount(1);
});
