import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";

import { expectSingleCompanion } from "./helpers/companion";

const WELCOME_MESSAGE =
  "以后我会陪你照看这座花园。你可以随时来记录想法，也可以让我带你看看以前种下的内容。";
const DORMANCY_RESPONSE =
  "植物连续满 72 小时没有互动后会休眠，内容不会消失。再次打开或复盘后它会恢复，植物也不会死亡。";
const RECOMMENDATION_UNAVAILABLE = "暂时没能找到适合回看的内容，你仍然可以在卡片模式中查找。";
const OLD_FRAGMENT_ID = "stage6-old-dormant-fragment";
const OLD_FRAGMENT_TITLE = "重新看看那次雨天散步";
const NEW_FRAGMENT_ID = "stage6-new-fragment";
const NEW_FRAGMENT_TITLE = "刚刚种下的窗边念头";
const SECOND_OLD_FRAGMENT_ID = "stage6-second-old-fragment";
const SECOND_OLD_FRAGMENT_TITLE = "还没整理的手作灵感";
const COMPANION_WORLD_POSITION = { x: 496, y: 76 };

type RuntimeObservations = {
  failedExternalRequests: string[];
  pageErrors: string[];
  prohibitedRequests: string[];
};

type SeedFragment = {
  ageHours: number;
  id: string;
  lifecycleStatus: "active" | "dormant";
  rawText: string;
  slotId: string;
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

    if (url.includes("openai") || url.includes("getnote") || url.includes("/api/ai/")) {
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

async function openCompanionFromCanvas(page: Page): Promise<void> {
  const gardenHost = page.getByTestId("garden-canvas-host");
  await expect(gardenHost).toHaveAttribute("aria-busy", "false");
  await clickCanvasWorld(page, COMPANION_WORLD_POSITION.x, COMPANION_WORLD_POSITION.y);
  await expect(page.getByRole("dialog", { name: "花园伙伴" })).toBeVisible();
}

async function sendCompanionMessage(page: Page, message: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "花园伙伴" });
  await dialog.getByLabel("想问些什么？").fill(message);
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect(dialog.getByText(message, { exact: true })).toBeVisible();
}

async function seedFragments(
  page: Page,
  fragments: readonly SeedFragment[],
  suppressDailyRecommendation: boolean,
): Promise<void> {
  await page.evaluate(
    async ({ fragmentSeeds, shouldSuppressDaily }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(["settings", "fragments", "plants"], "readwrite");
      const completion = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(now.getDate()).padStart(2, "0")}`;

      if (shouldSuppressDaily) {
        transaction.objectStore("settings").put({
          id: "local-user",
          onboardingCompleted: true,
          companionType: "cat",
          lastOpenedAt: null,
          lastRecommendationDate: localDate,
          schemaVersion: 1,
        });
      }

      for (const fragmentSeed of fragmentSeeds) {
        const createdAt = new Date(now.getTime() - fragmentSeed.ageHours * 60 * 60 * 1_000);
        const timestamp = createdAt.toISOString();

        transaction.objectStore("fragments").put({
          id: fragmentSeed.id,
          contentType: "text",
          title: fragmentSeed.title,
          rawText: fragmentSeed.rawText,
          sourceUrl: null,
          summary: null,
          keywords: [],
          lifecycleStatus: fragmentSeed.lifecycleStatus,
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
          id: `plant-${fragmentSeed.id}`,
          fragmentId: fragmentSeed.id,
          speciesId: null,
          stage: "seedling",
          vitality: fragmentSeed.lifecycleStatus,
          growthScore: 0,
          slotId: fragmentSeed.slotId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      await completion;
      database.close();
    },
    {
      fragmentSeeds: fragments,
      shouldSuppressDaily: suppressDailyRecommendation,
    },
  );
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

test("selects and persists one cat companion with local chat history", async ({
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
  await openCompanionFromCanvas(page);
  await expect(page.getByTestId("garden-canvas-host")).toHaveAttribute(
    "data-movement-state",
    "idle",
  );
  let chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.getByText(WELCOME_MESSAGE, { exact: true })).toBeVisible();
  await sendCompanionMessage(page, "植物为什么休眠");
  await expect(chat.getByText(DORMANCY_RESPONSE, { exact: true })).toBeVisible();

  await page.reload();
  await expect(onboarding).toBeHidden();
  await expectSingleCompanion(page, "cat");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.getByText(WELCOME_MESSAGE, { exact: true })).toHaveCount(1);
  await expect(chat.getByText("植物为什么休眠", { exact: true })).toBeVisible();
  await expect(chat.getByText(DORMANCY_RESPONSE, { exact: true })).toBeVisible();
  await chat.getByLabel("想问些什么？").press("Escape");
  await expect(chat).toBeHidden();

  expectCleanRuntime(observations);
});

test("recommends an eligible old fragment, opens it once, and dismisses without mutation", async ({
  context,
  page,
}) => {
  const observations = observeRuntime(page);
  await clearIndexedDb(context, page);
  await page.goto("/garden");
  await chooseCompanion(page, "猫");
  await seedFragments(
    page,
    [
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
    ],
    true,
  );
  await page.reload();
  await expectSingleCompanion(page, "cat");
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();

  await sendCompanionMessage(page, "我该看看什么？");
  let chat = page.getByRole("dialog", { name: "花园伙伴" });
  const oldRecommendation = chat.locator(`article[data-fragment-id="${OLD_FRAGMENT_ID}"]`);
  await expect(oldRecommendation).toContainText(OLD_FRAGMENT_TITLE);
  await expect(oldRecommendation).not.toContainText(NEW_FRAGMENT_TITLE);
  await oldRecommendation.getByRole("button", { name: "去看看", exact: true }).click();

  const oldDetail = page.getByRole("dialog", { name: OLD_FRAGMENT_TITLE });
  await expect(oldDetail).toBeVisible();
  await expect(oldDetail.getByText("活跃", { exact: true }).first()).toBeVisible();
  const openedState = await readFragmentPersistenceState(page, OLD_FRAGMENT_ID);
  expect(openedState.lifecycleStatus).toBe("active");
  expect(openedState.events.filter((event) => event === "viewed")).toHaveLength(1);
  expect(openedState.events.filter((event) => event === "restored")).toHaveLength(1);
  expect(openedState.recommendations).toHaveLength(1);
  expect(openedState.recommendations[0]?.openedAt).not.toBeNull();
  expect(openedState.recommendations[0]?.dismissedAt).toBeNull();
  await oldDetail.getByRole("button", { name: "关闭详情" }).click();

  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  await sendCompanionMessage(page, "推荐一条以前的想法");
  chat = page.getByRole("dialog", { name: "花园伙伴" });
  await expect(chat.getByText(RECOMMENDATION_UNAVAILABLE, { exact: true })).toBeVisible();
  await expect(chat.locator(`article[data-fragment-id="${OLD_FRAGMENT_ID}"]`)).toHaveCount(0);

  await seedFragments(
    page,
    [
      {
        ageHours: 168,
        id: SECOND_OLD_FRAGMENT_ID,
        lifecycleStatus: "dormant",
        rawText: "把剩下的布料做成一个可以随手收纳的小袋子。",
        slotId: "slot-03",
        title: SECOND_OLD_FRAGMENT_TITLE,
      },
    ],
    false,
  );
  const secondBefore = await readFragmentPersistenceState(page, SECOND_OLD_FRAGMENT_ID);
  await page.reload();
  await expectSingleCompanion(page, "cat");
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  chat = page.getByRole("dialog", { name: "花园伙伴" });
  await sendCompanionMessage(page, "带我回顾一下");
  const secondRecommendation = chat.locator(
    `article[data-fragment-id="${SECOND_OLD_FRAGMENT_ID}"]`,
  );
  await expect(secondRecommendation).toContainText(SECOND_OLD_FRAGMENT_TITLE);
  await secondRecommendation.getByRole("button", { name: "先不用", exact: true }).click();
  await expect(secondRecommendation).toHaveCount(0);

  const dismissedState = await readFragmentPersistenceState(page, SECOND_OLD_FRAGMENT_ID);
  expect(dismissedState.lifecycleStatus).toBe(secondBefore.lifecycleStatus);
  expect(dismissedState.lastInteractedAt).toBe(secondBefore.lastInteractedAt);
  expect(dismissedState.events).toEqual([]);
  expect(dismissedState.recommendations).toHaveLength(1);
  expect(dismissedState.recommendations[0]?.openedAt).toBeNull();
  expect(dismissedState.recommendations[0]?.dismissedAt).not.toBeNull();

  expectCleanRuntime(observations);
});

test("supports the same required onboarding path with the dog visual", async ({
  context,
  page,
}) => {
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
  await page.getByRole("button", { name: "打开花园伙伴", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "花园伙伴" }).getByText(WELCOME_MESSAGE, { exact: true }),
  ).toBeVisible();

  expectCleanRuntime(observations);
});
