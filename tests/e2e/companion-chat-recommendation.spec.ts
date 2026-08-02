import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";

import { GARDEN_MAP_CONFIG } from "../../game/config/garden-map";
import { expectSingleCompanion } from "./helpers/companion";
import { readFragmentGardenPersistence } from "./helpers/indexed-db";

const MAIN_OPTION_LABELS = [
  "帮我找一株值得重新看看的植物",
  "看看我的花园近况",
  "帮我种下一个新想法",
  "更多",
  "离开",
] as const;
const MORE_OPTION_LABELS = [
  "看看哪些植物正在休眠",
  "告诉我植物为什么会成长",
  "告诉我休眠、完成和封存是什么",
  "只是来看看你",
  "返回",
  "离开",
] as const;
const OLD_FRAGMENT_ID = "stage8-old-dormant-fragment";
const OLD_FRAGMENT_TITLE = "重新看看那次雨天散步";
const NEW_FRAGMENT_ID = "stage8-new-fragment";
const NEW_FRAGMENT_TITLE = "刚刚种下的窗边念头";
const SECOND_OLD_FRAGMENT_ID = "stage8-second-old-fragment";
const SECOND_OLD_FRAGMENT_TITLE = "还没整理的手作灵感";
const COMPLETED_FRAGMENT_ID = "stage8-completed-fragment";
const COMPLETED_FRAGMENT_TITLE = "已经完成的旅行清单";
const ARCHIVED_FRAGMENT_ID = "stage8-archived-fragment";
const ARCHIVED_FRAGMENT_TITLE = "已经封存的旧计划";
const NPC_CREATED_TITLE = "伙伴入口种下的窗边想法";
const NPC_CREATED_TEXT = "把窗边整理出来，先放一盆容易照看的植物。";
const COMPANION_WORLD_POSITION = {
  x: GARDEN_MAP_CONFIG.companionPosition.x,
  y: GARDEN_MAP_CONFIG.companionPosition.y - 34,
};

type RuntimeObservations = {
  failedExternalRequests: string[];
  pageErrors: string[];
  prohibitedRequests: string[];
};

type SeedFragment = {
  ageHours: number;
  completionStatus?: "open" | "completed";
  id: string;
  lifecycleStatus: "active" | "dormant" | "archived";
  rawText: string;
  slotId: string | null;
  title: string;
};

type RecommendationRecord = {
  dismissedAt: string | null;
  fragmentId: string;
  openedAt: string | null;
};

type FragmentPersistenceState = {
  events: string[];
  lastInteractedAt: string;
  lifecycleStatus: string;
  recommendations: RecommendationRecord[];
};

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

function observeRuntime(page: Page): RuntimeObservations {
  const baseURL = test.info().project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("The Playwright project must define a baseURL.");
  }

  const appOrigin = new URL(baseURL).origin;
  const observations: RuntimeObservations = {
    failedExternalRequests: [],
    pageErrors: [],
    prohibitedRequests: [],
  };

  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = request.url().toLowerCase();

    if (
      url.includes("/api/companion/respond") ||
      url.includes("openai.com") ||
      url.includes("openapi.biji.com") ||
      url.includes("getnote")
    ) {
      observations.prohibitedRequests.push(request.url());
    }
  });
  page.on("requestfailed", (request) => {
    if (isExternalRequest(request, appOrigin)) {
      observations.failedExternalRequests.push(
        `${request.method()} ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
      );
    }
  });

  return observations;
}

function isExternalRequest(request: Request, appOrigin: string): boolean {
  try {
    return new URL(request.url()).origin !== appOrigin;
  } catch {
    return true;
  }
}

function expectCleanRuntime(observations: RuntimeObservations): void {
  expect(observations.pageErrors).toEqual([]);
  expect(observations.failedExternalRequests).toEqual([]);
  expect(observations.prohibitedRequests).toEqual([]);
}

async function chooseCompanion(page: Page, companion: "猫" | "狗"): Promise<void> {
  const dialog = page.getByRole("dialog", {
    name: "选择一位陪你照看花园的伙伴",
  });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: `选择${companion}`, exact: true }).click();
  await expect(dialog).toBeHidden();
}

function getCompanionDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "花园伙伴" });
}

function getNpcScreen(dialog: Locator, name: string): Locator {
  return dialog.getByRole("region", { name, exact: true });
}

async function expectMenuLabels(menu: Locator, labels: readonly string[]): Promise<void> {
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button")).toHaveCount(labels.length);
  const actualLabels = (await menu.getByRole("button").allTextContents()).map((label) =>
    label.trim(),
  );
  expect(actualLabels).toEqual(labels);
}

async function clickCanvasWorld(page: Page, worldX: number, worldY: number): Promise<void> {
  const canvas = page.getByTestId("garden-canvas-host").locator("canvas");
  const scale = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const bounds = canvasElement.getBoundingClientRect();

    return {
      x: bounds.width / canvasElement.width,
      y: bounds.height / canvasElement.height,
    };
  });

  await canvas.click({
    position: {
      x: worldX * scale.x,
      y: worldY * scale.y,
    },
  });
}

async function openCompanionFromCanvas(page: Page): Promise<Locator> {
  const gardenHost = page.getByTestId("garden-canvas-host");
  await expect(gardenHost).toHaveAttribute("aria-busy", "false");
  await clickCanvasWorld(page, COMPANION_WORLD_POSITION.x, COMPANION_WORLD_POSITION.y);
  const dialog = getCompanionDialog(page);
  await expect(dialog).toBeVisible();
  await expect(getNpcScreen(dialog, "伙伴主菜单")).toBeVisible();
  return dialog;
}

async function openCompanionFromButton(page: Page): Promise<Locator> {
  const existingDialog = getCompanionDialog(page);
  if (await existingDialog.isVisible()) {
    await expect(getNpcScreen(existingDialog, "伙伴主菜单")).toBeVisible();
    return existingDialog;
  }

  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  const dialog = getCompanionDialog(page);
  await expect(dialog).toBeVisible();
  await expect(getNpcScreen(dialog, "伙伴主菜单")).toBeVisible();
  return dialog;
}

async function seedFragments(page: Page, fragments: readonly SeedFragment[]): Promise<void> {
  await page.evaluate(async (fragmentSeeds) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(["fragments", "plants"], "readwrite");
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    const now = new Date();

    for (const fragmentSeed of fragmentSeeds) {
      const createdAt = new Date(now.getTime() - fragmentSeed.ageHours * 60 * 60 * 1_000);
      const timestamp = createdAt.toISOString();
      const completionStatus = fragmentSeed.completionStatus ?? "open";

      transaction.objectStore("fragments").put({
        id: fragmentSeed.id,
        contentType: "text",
        title: fragmentSeed.title,
        rawText: fragmentSeed.rawText,
        sourceUrl: null,
        contentMarkdown: fragmentSeed.rawText,
        summary: null,
        keywords: [],
        lifecycleStatus: fragmentSeed.lifecycleStatus,
        completionStatus,
        analysisStatus: "not_required",
        embedding: null,
        parentFragmentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: completionStatus === "completed" ? timestamp : null,
      });
      transaction.objectStore("plants").put({
        id: `plant-${fragmentSeed.id}`,
        fragmentId: fragmentSeed.id,
        speciesId: null,
        stage: completionStatus === "completed" ? "permanent_bloom" : "seedling",
        vitality: fragmentSeed.lifecycleStatus === "dormant" ? "dormant" : "active",
        growthScore: 0,
        slotId: fragmentSeed.slotId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    await completion;
    database.close();
  }, fragments);
}

async function readFragmentPersistenceState(
  page: Page,
  fragmentId: string,
): Promise<FragmentPersistenceState> {
  return page.evaluate(async (targetFragmentId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(
      ["fragments", "fragmentEvents", "recommendations"],
      "readonly",
    );
    const read = <T>(request: IDBRequest<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    const [fragment, events, recommendations] = await Promise.all([
      read(transaction.objectStore("fragments").get(targetFragmentId)),
      read(transaction.objectStore("fragmentEvents").getAll()),
      read(transaction.objectStore("recommendations").getAll()),
    ]);

    database.close();

    if (fragment === undefined) {
      throw new Error(`Fragment ${targetFragmentId} was not found`);
    }

    const typedFragment = fragment as {
      lastInteractedAt: string;
      lifecycleStatus: string;
    };

    return {
      events: (
        events as Array<{
          fragmentId: string;
          type: string;
        }>
      )
        .filter((event) => event.fragmentId === targetFragmentId)
        .map((event) => event.type),
      lastInteractedAt: typedFragment.lastInteractedAt,
      lifecycleStatus: typedFragment.lifecycleStatus,
      recommendations: (
        recommendations as Array<{
          dismissedAt: string | null;
          fragmentId: string;
          openedAt: string | null;
        }>
      ).filter((recommendation) => recommendation.fragmentId === targetFragmentId),
    };
  }, fragmentId);
}

test("opens the deterministic NPC main and more menus without chat or AI", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  await clearIndexedDb(context, page);
  await page.goto("/garden");

  const onboarding = page.getByRole("dialog", {
    name: "选择一位陪你照看花园的伙伴",
  });
  await expect(onboarding).toContainText("猫和狗拥有相同的功能，只是外观不同。");
  await page.keyboard.press("Escape");
  await expect(onboarding).toBeVisible();
  await chooseCompanion(page, "猫");
  await expectSingleCompanion(page, "cat");
  await expect(page.locator("canvas")).toHaveCount(1);

  await clickCanvasWorld(page, 496, 400);
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
    "data-movement-state",
    "moving",
  );
  let dialog = await openCompanionFromCanvas(page);
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
    "data-movement-state",
    "idle",
  );

  let main = getNpcScreen(dialog, "伙伴主菜单");
  await expect(main.getByText("今天想先看看花园里的什么？", { exact: true })).toBeVisible();
  await expectMenuLabels(main, MAIN_OPTION_LABELS);
  await expect(dialog.locator("input, textarea")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "发送", exact: true })).toHaveCount(0);
  await expect(dialog.getByTestId("companion-mode")).toHaveCount(0);
  await expect(dialog.getByRole("log")).toHaveCount(0);

  await main.getByRole("button", { name: "更多", exact: true }).click();
  const more = getNpcScreen(dialog, "伙伴更多选项");
  await expect(
    more.getByText("还有一些关于花园的事，我也可以告诉你。", { exact: true }),
  ).toBeVisible();
  await expectMenuLabels(more, MORE_OPTION_LABELS);
  await more.getByRole("button", { name: "返回", exact: true }).click();

  main = getNpcScreen(dialog, "伙伴主菜单");
  await expectMenuLabels(main, MAIN_OPTION_LABELS);
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
    "data-movement-state",
    "idle",
  );
  await main.getByRole("button", { name: "离开", exact: true }).click();
  await expect(dialog).toBeHidden();

  dialog = await openCompanionFromButton(page);
  await expect(getNpcScreen(dialog, "伙伴主菜单")).toBeVisible();
  await expect(getNpcScreen(dialog, "伙伴更多选项")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "打开花园伙伴", exact: true })).toBeFocused();

  expectCleanRuntime(observations);
});

test("shows local garden counts and opens only dormant fragments through shared details", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  await clearIndexedDb(context, page);
  await page.goto("/garden");
  await chooseCompanion(page, "猫");
  await seedFragments(page, [
    {
      ageHours: 240,
      id: OLD_FRAGMENT_ID,
      lifecycleStatus: "dormant",
      rawText: "那天绕开大路，沿着河边慢慢走了一圈。",
      slotId: "slot-01",
      title: OLD_FRAGMENT_TITLE,
    },
    {
      ageHours: 1,
      id: NEW_FRAGMENT_ID,
      lifecycleStatus: "active",
      rawText: "试着把窗边空出来，放一小盆绿植。",
      slotId: "slot-02",
      title: NEW_FRAGMENT_TITLE,
    },
    {
      ageHours: 120,
      completionStatus: "completed",
      id: COMPLETED_FRAGMENT_ID,
      lifecycleStatus: "active",
      rawText: "已经整理并走完的路线。",
      slotId: "slot-03",
      title: COMPLETED_FRAGMENT_TITLE,
    },
    {
      ageHours: 360,
      id: ARCHIVED_FRAGMENT_ID,
      lifecycleStatus: "archived",
      rawText: "以后也许还会重新拿出来。",
      slotId: null,
      title: ARCHIVED_FRAGMENT_TITLE,
    },
  ]);
  await page.reload();
  await expectSingleCompanion(page, "cat");

  let dialog = await openCompanionFromButton(page);
  let main = getNpcScreen(dialog, "伙伴主菜单");
  await main.getByRole("button", { name: "看看我的花园近况", exact: true }).click();
  const summary = getNpcScreen(dialog, "花园近况");
  await expect(
    summary.getByText("现在有 2 株植物正在生长，还有 1 株正在休息。", { exact: true }),
  ).toBeVisible();
  await expect(summary).toContainText("你已经让 1 株植物永久盛开了。");
  await expect(summary).toContainText("还有 1 株内容已经封存，仍然保留在卡片里。");
  await summary.getByRole("button", { name: "看看休眠植物", exact: true }).click();

  const dormantList = getNpcScreen(dialog, "休眠植物");
  await expect(dormantList).toContainText(OLD_FRAGMENT_TITLE);
  await expect(dormantList).not.toContainText(NEW_FRAGMENT_TITLE);
  await expect(dormantList).not.toContainText(ARCHIVED_FRAGMENT_TITLE);
  const dormantOpenButton = dormantList.getByRole("button").filter({
    hasText: OLD_FRAGMENT_TITLE,
  });
  await dormantOpenButton.press("Enter");

  const detail = page.getByRole("dialog", { name: OLD_FRAGMENT_TITLE });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("那天绕开大路，沿着河边慢慢走了一圈。");
  await expect(detail.getByText(/内容状态|成长分|成长阶段|成长与状态记录|系统事件/u)).toHaveCount(
    0,
  );
  await expect(detail.getByRole("button", { name: /标记完成|封存/u })).toHaveCount(0);
  const openedState = await readFragmentPersistenceState(page, OLD_FRAGMENT_ID);
  expect(openedState.lifecycleStatus).toBe("active");
  expect(openedState.events.filter((event) => event === "viewed")).toHaveLength(1);
  expect(openedState.events.filter((event) => event === "restored")).toHaveLength(1);
  expect(openedState.recommendations).toEqual([]);
  await detail.getByRole("button", { name: "返回", exact: true }).click();

  dialog = await openCompanionFromButton(page);
  main = getNpcScreen(dialog, "伙伴主菜单");
  await main.getByRole("button", { name: "更多", exact: true }).click();
  const more = getNpcScreen(dialog, "伙伴更多选项");
  await more.getByRole("button", { name: "告诉我休眠、完成和封存是什么", exact: true }).click();
  const lifecycle = getNpcScreen(dialog, "生命周期规则");
  await expect(lifecycle).toContainText("72 小时");
  await expect(lifecycle).toContainText("植物不会死亡");
  await expect(lifecycle).toContainText("永久盛开");
  await expect(lifecycle).toContainText("释放植物槽位");
  await lifecycle.getByRole("button", { name: "返回", exact: true }).click();
  await expect(getNpcScreen(dialog, "伙伴主菜单")).toBeVisible();
  await dialog.getByRole("button", { name: "关闭花园伙伴" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);

  expectCleanRuntime(observations);
});

test("requests recommendations only on demand and persists opened and dismissed results", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  await clearIndexedDb(context, page);
  await page.goto("/garden");
  await chooseCompanion(page, "猫");
  await seedFragments(page, [
    {
      ageHours: 240,
      id: OLD_FRAGMENT_ID,
      lifecycleStatus: "dormant",
      rawText: "那天绕开大路，沿着河边慢慢走了一圈。",
      slotId: "slot-01",
      title: OLD_FRAGMENT_TITLE,
    },
    {
      ageHours: 1,
      id: NEW_FRAGMENT_ID,
      lifecycleStatus: "active",
      rawText: "试着把窗边空出来，放一小盆绿植。",
      slotId: "slot-02",
      title: NEW_FRAGMENT_TITLE,
    },
  ]);
  await page.reload();
  await expectSingleCompanion(page, "cat");
  await expect(page.getByText("今天要不要看看一株以前种下的植物？")).toHaveCount(0);

  let dialog = await openCompanionFromButton(page);
  let main = getNpcScreen(dialog, "伙伴主菜单");
  await main.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }).click();
  let recommendationResult = getNpcScreen(dialog, "回看推荐");
  let oldRecommendation = recommendationResult.locator(
    `article[data-fragment-id="${OLD_FRAGMENT_ID}"]`,
  );
  await expect(oldRecommendation).toContainText(OLD_FRAGMENT_TITLE);
  await expect(oldRecommendation).not.toContainText(NEW_FRAGMENT_TITLE);

  await page.reload();
  await expectSingleCompanion(page, "cat");
  dialog = await openCompanionFromButton(page);
  main = getNpcScreen(dialog, "伙伴主菜单");
  await main.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }).click();
  recommendationResult = getNpcScreen(dialog, "回看推荐");
  oldRecommendation = recommendationResult.locator(
    `article[data-fragment-id="${OLD_FRAGMENT_ID}"]`,
  );
  await expect(oldRecommendation).toContainText(OLD_FRAGMENT_TITLE);
  await oldRecommendation.getByRole("button", { name: "去看看", exact: true }).click();

  const detail = page.getByRole("dialog", { name: OLD_FRAGMENT_TITLE });
  await expect(detail).toBeVisible();
  const openedState = await readFragmentPersistenceState(page, OLD_FRAGMENT_ID);
  expect(openedState.lifecycleStatus).toBe("active");
  expect(openedState.events.filter((event) => event === "viewed")).toHaveLength(1);
  expect(openedState.events.filter((event) => event === "restored")).toHaveLength(1);
  expect(openedState.recommendations).toHaveLength(1);
  expect(openedState.recommendations[0]?.openedAt).not.toBeNull();
  expect(openedState.recommendations[0]?.dismissedAt).toBeNull();
  await expect(detail.getByText(/内容状态|成长分|成长阶段|成长与状态记录|系统事件/u)).toHaveCount(
    0,
  );
  await detail.getByRole("button", { name: "返回", exact: true }).click();

  dialog = await openCompanionFromButton(page);
  main = getNpcScreen(dialog, "伙伴主菜单");
  await main.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }).click();
  recommendationResult = getNpcScreen(dialog, "回看推荐");
  await expect(
    recommendationResult.getByText("现在没有特别适合回看的植物。你也可以直接去卡片模式里看看。", {
      exact: true,
    }),
  ).toBeVisible();

  await seedFragments(page, [
    {
      ageHours: 168,
      id: SECOND_OLD_FRAGMENT_ID,
      lifecycleStatus: "dormant",
      rawText: "把剩下的布料做成一个可以随手收纳的小袋子。",
      slotId: "slot-03",
      title: SECOND_OLD_FRAGMENT_TITLE,
    },
  ]);
  const secondBefore = await readFragmentPersistenceState(page, SECOND_OLD_FRAGMENT_ID);
  await recommendationResult.getByRole("button", { name: "返回", exact: true }).click();
  main = getNpcScreen(dialog, "伙伴主菜单");
  await main.getByRole("button", { name: "帮我找一株值得重新看看的植物", exact: true }).click();
  recommendationResult = getNpcScreen(dialog, "回看推荐");
  const secondRecommendation = recommendationResult.locator(
    `article[data-fragment-id="${SECOND_OLD_FRAGMENT_ID}"]`,
  );
  await expect(secondRecommendation).toContainText(SECOND_OLD_FRAGMENT_TITLE);
  await secondRecommendation.getByRole("button", { name: "先不用", exact: true }).click();
  await expect(secondRecommendation).toHaveCount(0);
  await expect(
    recommendationResult.getByText("好，先不用看它。它会继续留在花园里，想看的时候再回来就好。", {
      exact: true,
    }),
  ).toBeVisible();

  const dismissedState = await readFragmentPersistenceState(page, SECOND_OLD_FRAGMENT_ID);
  expect(dismissedState.lifecycleStatus).toBe(secondBefore.lifecycleStatus);
  expect(dismissedState.lastInteractedAt).toBe(secondBefore.lastInteractedAt);
  expect(dismissedState.events).toEqual([]);
  expect(dismissedState.recommendations).toHaveLength(1);
  expect(dismissedState.recommendations[0]?.openedAt).toBeNull();
  expect(dismissedState.recommendations[0]?.dismissedAt).not.toBeNull();
  await recommendationResult.getByRole("button", { name: "离开", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);

  expectCleanRuntime(observations);
});

test("reuses the existing text creation flow from the NPC", async ({ context, page }) => {
  const observations = observeRuntime(page);
  await clearIndexedDb(context, page);
  await page.goto("/garden");
  await chooseCompanion(page, "猫");
  await expectSingleCompanion(page, "cat");
  const beforeCreate = await readFragmentGardenPersistence(page);

  const dialog = await openCompanionFromButton(page);
  await getNpcScreen(dialog, "伙伴主菜单")
    .getByRole("button", { name: "帮我种下一个新想法", exact: true })
    .click();

  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await expect(createDialog).toBeVisible();
  await expect(dialog).toBeHidden();
  await createDialog.getByLabel("标题（可选）").fill(NPC_CREATED_TITLE);
  await createDialog.getByLabel("内容").fill(NPC_CREATED_TEXT);
  await createDialog.getByRole("button", { name: "种下", exact: true }).click();
  await expect(createDialog).toBeHidden();

  await expect(page.getByTestId("garden-interaction-status")).toHaveText(
    "已经种下了。以后再回来看看，它也许会慢慢长出新的方向。",
  );
  await expect(page.getByRole("button", { name: `打开笔记：${NPC_CREATED_TITLE}` })).toBeVisible();

  const persistence = await readFragmentGardenPersistence(page);
  const fragment = persistence.fragments.find(({ title }) => title === NPC_CREATED_TITLE);
  expect(fragment).toMatchObject({
    contentMarkdown: NPC_CREATED_TEXT,
    contentType: "text",
    rawText: NPC_CREATED_TEXT,
  });
  expect(persistence.plants.filter(({ fragmentId }) => fragmentId === fragment?.id)).toHaveLength(
    1,
  );
  expect(persistence.chatMessages).toEqual(beforeCreate.chatMessages);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "花园模式", exact: true }).click();
  await expectSingleCompanion(page, "cat");
  await expect(page.locator("canvas")).toHaveCount(1);
  expectCleanRuntime(observations);
});

test("uses identical fixed NPC menus for the dog companion", async ({ context, page }) => {
  const observations = observeRuntime(page);
  await clearIndexedDb(context, page);
  await page.goto("/garden");
  const onboarding = page.getByRole("dialog", {
    name: "选择一位陪你照看花园的伙伴",
  });
  await onboarding.getByRole("button", { name: "选择狗", exact: true }).press("Enter");
  await expect(onboarding).toBeHidden();
  await expectSingleCompanion(page, "dog");
  await expect(page.locator("canvas")).toHaveCount(1);

  const dialog = await openCompanionFromButton(page);
  const main = getNpcScreen(dialog, "伙伴主菜单");
  await expectMenuLabels(main, MAIN_OPTION_LABELS);
  await main.getByRole("button", { name: "更多", exact: true }).click();
  await expectMenuLabels(getNpcScreen(dialog, "伙伴更多选项"), MORE_OPTION_LABELS);
  await expect(dialog.locator("input, textarea")).toHaveCount(0);
  await expect(dialog.getByTestId("companion-mode")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  expectCleanRuntime(observations);
});
