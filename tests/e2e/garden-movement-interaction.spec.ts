import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { GARDEN_MAP_CONFIG, PLANT_SLOT_CONFIGS } from "../../game/config/garden-map";
import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const FRAGMENT_TITLE = "沿着小路找到旧灵感";
const FRAGMENT_TEXT = "让人物走到植物旁边，再重新打开这条碎片。";
const FIRST_PLANT_SLOT = PLANT_SLOT_CONFIGS[0];
const RAPID_CLICK_FINAL_TARGET = PLANT_SLOT_CONFIGS[17];
const COLLISION_GRID_KEYS = new Set(
  GARDEN_MAP_CONFIG.collisionGridPositions.map(({ column, row }) => `${column},${row}`),
);
const BLOCKED_WATER_GRID = GARDEN_MAP_CONFIG.waterGridPositions.find(({ column, row }) =>
  COLLISION_GRID_KEYS.has(`${column},${row}`),
);

if (
  FIRST_PLANT_SLOT === undefined ||
  RAPID_CLICK_FINAL_TARGET === undefined ||
  BLOCKED_WATER_GRID === undefined
) {
  throw new Error("The garden requires plant slots and blocked water.");
}

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

async function createTextFragment(page: Page): Promise<void> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await dialog.getByLabel("标题（可选）").fill(FRAGMENT_TITLE);
  await dialog.getByLabel("内容").fill(FRAGMENT_TEXT);
  await dialog.getByRole("button", { name: "种下", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `打开笔记：${FRAGMENT_TITLE}` })).toBeVisible();
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

async function readPlayerPosition(page: Page): Promise<{
  x: number;
  y: number;
  state: string | null;
}> {
  return page.getByTestId("garden-canvas-host").evaluate((element) => ({
    x: Number((element as HTMLElement).dataset.playerX),
    y: Number((element as HTMLElement).dataset.playerY),
    state: (element as HTMLElement).dataset.movementState ?? null,
  }));
}

async function waitForIdlePlayer(page: Page): Promise<void> {
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
    "data-movement-state",
    "idle",
    { timeout: 12_000 },
  );
}

async function countViewedEvents(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction("fragmentEvents", "readonly");
      const request = transaction.objectStore("fragmentEvents").index("type").count("viewed");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    database.close();
    return count;
  });
}

test("moves through the fixed garden and opens fragments through plants", async ({
  context,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await clearIndexedDb(context, page);

  await test.step("创建一条文字碎片并进入单 Canvas 花园", async () => {
    await page.goto("/garden");
    await completeCompanionOnboardingIfNeeded(page);
    await selectMode(page, "卡片模式");
    await createTextFragment(page);
    await selectMode(page, "花园模式");
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.locator("canvas")).toHaveAttribute("data-plant-feedback", "created");
    await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
      "data-plant-count",
      "1",
    );
  });

  await test.step("点击可行走地面后人物按 delta 移动到目标格心", async () => {
    const before = await readPlayerPosition(page);
    await clickCanvasWorld(page, 496, 400);
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
      "data-movement-state",
      "moving",
    );
    await expect.poll(async () => (await readPlayerPosition(page)).y).toBeLessThan(before.y);
    await waitForIdlePlayer(page);
    const after = await readPlayerPosition(page);
    expect(after.x).toBeCloseTo(496, 1);
    expect(after.y).toBeCloseTo(400, 1);
  });

  await test.step("点击植物后走到 interaction point 并只记录一次查看", async () => {
    await clickCanvasWorld(page, FIRST_PLANT_SLOT.x, FIRST_PLANT_SLOT.y);
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
      "data-selected-plant-id",
      /.+/u,
    );
    await expect(page.getByRole("dialog", { name: FRAGMENT_TITLE })).toBeVisible({
      timeout: 12_000,
    });
    expect(await countViewedEvents(page)).toBe(1);
    await page
      .getByRole("dialog", { name: FRAGMENT_TITLE })
      .getByRole("button", { name: "返回", exact: true })
      .click();
  });

  await test.step("快速连续点击时只有最后一个地面目标生效", async () => {
    await clickCanvasWorld(page, 400, 240);
    await page.waitForTimeout(120);
    await clickCanvasWorld(
      page,
      RAPID_CLICK_FINAL_TARGET.interactionX,
      RAPID_CLICK_FINAL_TARGET.interactionY,
    );
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
      "data-movement-state",
      "moving",
    );
    await waitForIdlePlayer(page);
    const finalPosition = await readPlayerPosition(page);
    expect(finalPosition.x).toBeCloseTo(RAPID_CLICK_FINAL_TARGET.interactionX, 1);
    expect(finalPosition.y).toBeCloseTo(RAPID_CLICK_FINAL_TARGET.interactionY, 1);
  });

  await test.step("模式切换重建单 Canvas，并阻止人物进入水池", async () => {
    await selectMode(page, "卡片模式");
    await expect(page.locator("canvas")).toHaveCount(0);
    await selectMode(page, "花园模式");
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute("aria-busy", "false");
    await page.locator("canvas").evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const beforePondClick = await readPlayerPosition(page);
    await clickCanvasWorld(
      page,
      BLOCKED_WATER_GRID.column * GARDEN_MAP_CONFIG.tileSize + GARDEN_MAP_CONFIG.tileSize / 2,
      BLOCKED_WATER_GRID.row * GARDEN_MAP_CONFIG.tileSize + GARDEN_MAP_CONFIG.tileSize / 2,
    );
    await expect(page.getByTestId("garden-interaction-status")).toContainText("不能通行");
    expect(await readPlayerPosition(page)).toEqual(beforePondClick);
  });

  await test.step("可访问植物列表可以绕过人物移动直接打开同一详情", async () => {
    const summary = page.getByTestId("garden-accessibility-summary");
    const directOpenButton = page.getByRole("button", {
      name: `打开“${FRAGMENT_TITLE}”`,
    });
    await clickCanvasWorld(page, FIRST_PLANT_SLOT.x, FIRST_PLANT_SLOT.y);
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
      "data-movement-state",
      "moving",
    );
    await summary.locator("summary").click();
    await expect(directOpenButton).toContainText(`打开“${FRAGMENT_TITLE}”`);
    await directOpenButton.focus();
    await expect(directOpenButton).toBeFocused();
    await directOpenButton.press("Enter");
    await expect(page.getByRole("dialog", { name: FRAGMENT_TITLE })).toBeVisible();
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
      "data-movement-state",
      "idle",
    );
    await expect(page.getByTestId("garden-canvas-host")).not.toHaveAttribute(
      "data-selected-plant-id",
      /.+/u,
    );
    expect(await countViewedEvents(page)).toBe(2);
    await page
      .getByRole("dialog", { name: FRAGMENT_TITLE })
      .getByRole("button", { name: "返回", exact: true })
      .click();
    await expect(directOpenButton).toBeFocused();
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: FRAGMENT_TITLE })).toBeHidden();
  });

  await test.step("返回花园后再次点击植物仍可打开，删除后植物同步消失", async () => {
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute("aria-busy", "false");
    await clickCanvasWorld(page, FIRST_PLANT_SLOT.x, FIRST_PLANT_SLOT.y);
    await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
      "data-selected-plant-id",
      /.+/u,
    );
    const detailDialog = page.getByRole("dialog", { name: FRAGMENT_TITLE });
    await expect(detailDialog).toBeVisible({ timeout: 12_000 });
    expect(await countViewedEvents(page)).toBe(3);
    await detailDialog.getByRole("button", { name: "删除", exact: true }).click();
    const confirmDialog = page.getByRole("alertdialog", { name: "删除这条笔记？" });
    await confirmDialog.getByRole("button", { name: "确认删除", exact: true }).click();

    await expect(detailDialog).toBeHidden();
    await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
      "data-plant-count",
      "0",
    );
    await expect(page.locator("canvas")).toHaveCount(1);
  });

  expect(pageErrors).toEqual([]);
});

test("falls back to one interactive Canvas when pixel map assets cannot load", async ({
  context,
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await clearIndexedDb(context, page);
  await page.route("**/assets/garden/**", async (route) => {
    await route.abort("failed");
  });
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);

  const gardenHost = page.getByTestId("garden-canvas-host");
  await expect(gardenHost.locator("canvas")).toHaveCount(1);
  await expect(gardenHost).toHaveAttribute("aria-busy", "false");
  await expect
    .poll(() =>
      consoleErrors.some((message) =>
        message.includes("像素花园地图暂时无法载入，已切换到本地备用地图"),
      ),
    )
    .toBe(true);

  const before = await readPlayerPosition(page);
  await clickCanvasWorld(page, 496, 400);
  await waitForIdlePlayer(page);
  expect(await readPlayerPosition(page)).not.toEqual(before);

  await selectMode(page, "卡片模式");
  await expect(page.locator("canvas")).toHaveCount(0);
  await selectMode(page, "花园模式");
  await expect(page.locator("canvas")).toHaveCount(1);
});
