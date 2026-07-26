import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import {
  clearFragmentGardenIndexedDb,
  readFragmentGardenPersistence,
  type FragmentGardenPersistenceState,
} from "./helpers/indexed-db";

const INSUFFICIENT_TITLE = "减少无意识刷短视频的三个方法";
const INSUFFICIENT_BODY = "";
const DISCLOSURE_TITLE = "减少无意识刷短视频";
const DISCLOSURE_BODY =
  "想做一个帮助人少刷短视频的工具，先理解触发刷视频的情境，再决定提供什么支持。";
const ROTATION_TITLE = "周末社区阅读角";
const ROTATION_BODY = "想在社区做一个周末阅读角，让邻居可以交换短篇书，也能留下读完后的简单想法。";
const FAILURE_TITLE = "整理旅行前的准备";
const FAILURE_BODY = "想把每次出发前重复检查的事情整理成一份简短清单，减少临时遗漏。";

type SproutRequest = {
  fragment: {
    isArchived: boolean;
    isCompleted: boolean;
    lifecycleStatus: "active" | "dormant" | "archived";
    title: string;
  };
  avoidDirections: string[];
};

type SproutSuggestion = {
  direction: string;
  guidingQuestion: string;
  recommendedAction:
    "add_content" | "record_next_step" | "grow_new_idea" | "keep_for_later" | "mark_completed";
  type: "suggestion";
};

type SeedFragment = {
  completionStatus?: "open" | "completed";
  contentType?: "text" | "link";
  id: string;
  lifecycleStatus: "active" | "dormant" | "archived";
  rawText: string;
  sourceUrl?: string | null;
  summary?: string | null;
  slotId: string | null;
  title: string;
};

type NetworkObservations = {
  companionRequestCount: number;
  pageErrors: string[];
  sproutRequestCount: number;
};

function getBaseUrl(): string {
  const baseURL = test.info().project.use.baseURL;

  if (typeof baseURL !== "string") {
    throw new Error("The Playwright project must define a baseURL.");
  }

  return baseURL;
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, getBaseUrl());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function createTextFragment(page: Page, title: string, rawText: string): Promise<void> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel("标题（可选）").fill(title);
  await createDialog.getByLabel("内容").fill(rawText);
  await createDialog.getByRole("button", { name: "种下", exact: true }).click();
  await expect(createDialog).toBeHidden();
  await expect(page.getByRole("button", { name: `打开笔记：${title}` })).toBeVisible();
}

async function openFragment(page: Page, title: string): Promise<Locator> {
  await page.getByRole("button", { name: `打开笔记：${title}` }).click();
  const detailDialog = page.getByRole("dialog", { name: title });
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog.getByRole("button", { name: "发芽", exact: true })).toBeVisible();
  return detailDialog;
}

async function openSprout(detailDialog: Locator): Promise<Locator> {
  await detailDialog.getByRole("button", { name: "发芽", exact: true }).click();
  const sproutDialog = detailDialog.page().getByRole("dialog", { name: "思维发芽" });
  await expect(sproutDialog).toBeVisible();
  return sproutDialog;
}

async function closeDetail(detailDialog: Locator): Promise<void> {
  await detailDialog.getByRole("button", { name: "返回", exact: true }).click();
  await expect(detailDialog).toBeHidden();
}

function observeNetwork(page: Page): NetworkObservations {
  const observations: NetworkObservations = {
    companionRequestCount: 0,
    pageErrors: [],
    sproutRequestCount: 0,
  };

  page.on("pageerror", (error) => observations.pageErrors.push(error.message));
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/companion/respond") {
      observations.companionRequestCount += 1;
    }

    if (pathname === "/api/sprout/analyze") {
      observations.sproutRequestCount += 1;
    }
  });

  return observations;
}

async function blockLegacyCompanionRoute(page: Page): Promise<void> {
  await page.route("**/api/companion/respond", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ type: "message", message: "unexpected legacy companion request" }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function fulfillSuggestion(route: Route, suggestion: SproutSuggestion): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(suggestion),
    contentType: "application/json",
    status: 200,
  });
}

async function setDisclosureState(
  page: Page,
  disclosures: {
    openAi?: string | null;
    sprout?: string | null;
  },
): Promise<void> {
  await page.evaluate(async (values) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("settings", "readwrite");
      const store = transaction.objectStore("settings");
      const getRequest = store.get("local-user");
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const settings = getRequest.result as Record<string, unknown> | undefined;
        if (settings === undefined) {
          reject(new Error("Local settings were not initialized"));
          return;
        }

        store.put({
          ...settings,
          ...(values.openAi === undefined ? {} : { openAiDisclosureAcceptedAt: values.openAi }),
          ...(values.sprout === undefined ? {} : { sproutAiDisclosureAcceptedAt: values.sprout }),
        });
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, disclosures);
}

async function seedFragments(page: Page, fragments: readonly SeedFragment[]): Promise<void> {
  await page.evaluate(async (seeds) => {
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
    const timestamp = new Date().toISOString();

    for (const seed of seeds) {
      const completionStatus = seed.completionStatus ?? "open";
      transaction.objectStore("fragments").put({
        id: seed.id,
        contentType: seed.contentType ?? "text",
        title: seed.title,
        rawText: seed.rawText,
        sourceUrl: seed.sourceUrl ?? null,
        summary: seed.summary ?? null,
        keywords: [],
        lifecycleStatus: seed.lifecycleStatus,
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
        id: `plant-${seed.id}`,
        fragmentId: seed.id,
        speciesId: null,
        stage: completionStatus === "completed" ? "permanent_bloom" : "seedling",
        vitality: seed.lifecycleStatus === "dormant" ? "dormant" : "active",
        growthScore: 0,
        slotId: seed.slotId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    await completion;
    database.close();
  }, fragments);
}

function findFragmentState(state: FragmentGardenPersistenceState, title: string) {
  const fragment = state.fragments.find((candidate) => candidate.title === title);

  if (fragment === undefined) {
    throw new Error(`Fragment ${title} was not found`);
  }

  const plant = state.plants.find((candidate) => candidate.fragmentId === fragment.id);
  if (plant === undefined) {
    throw new Error(`Plant for fragment ${title} was not found`);
  }

  return {
    fragment,
    partnerEvents: state.fragmentEvents.filter(
      (event) => event.fragmentId === fragment.id && event.type === "partner_suggestion_saved",
    ),
    plant,
  };
}

async function expectCleanBoundary(
  page: Page,
  observations: NetworkObservations,
  expectedSproutRequests: number,
): Promise<void> {
  await expect.poll(() => observations.sproutRequestCount).toBe(expectedSproutRequests);
  expect(observations.companionRequestCount).toBe(0);
  expect(observations.pageErrors).toEqual([]);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
}

test("keeps clearly insufficient content local without creating a suggestion", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  await blockLegacyCompanionRoute(page);
  await page.route("**/api/sprout/analyze", async (route) => {
    await fulfillSuggestion(route, {
      type: "suggestion",
      direction: "这条响应不应出现",
      guidingQuestion: "这条请求不应发出吗？",
      recommendedAction: "add_content",
    });
  });
  await initializeGarden(context, page);
  await seedFragments(page, [
    {
      id: "sprout-unreadable-link",
      contentType: "link",
      title: INSUFFICIENT_TITLE,
      rawText: INSUFFICIENT_BODY,
      sourceUrl: "https://example.com/unreadable-video",
      summary: null,
      lifecycleStatus: "active",
      slotId: "slot-01",
    },
  ]);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const detailDialog = await openFragment(page, INSUFFICIENT_TITLE);
  const before = findFragmentState(await readFragmentGardenPersistence(page), INSUFFICIENT_TITLE);
  const sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByText("伙伴正在过来看看……", { exact: true })).toBeVisible();
  await expect(sproutDialog.getByRole("heading", { name: "暂时还不能找到具体方向" })).toBeVisible();
  await expect(sproutDialog.getByText(/暂时没有检测到足够的“思维养分”/)).toBeVisible();
  await expect(sproutDialog.getByRole("button", { name: "保存这条建议" })).toHaveCount(0);
  await expect(sproutDialog.getByRole("button", { name: "换个方向" })).toHaveCount(0);

  const after = findFragmentState(await readFragmentGardenPersistence(page), INSUFFICIENT_TITLE);
  expect(after.fragment.rawText).toBe(INSUFFICIENT_BODY);
  expect(after.plant.growthScore).toBe(before.plant.growthScore);
  expect(after.partnerEvents).toEqual([]);
  await expectCleanBoundary(page, observations, 0);
});

test("requires the independent sprout disclosure and keeps an unsaved suggestion temporary", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  const suggestion: SproutSuggestion = {
    type: "suggestion",
    direction: "先聚焦晚间无意识打开短视频的一个具体触发场景。",
    guidingQuestion: "用户通常在什么情境下第一次意识到自己刷得太久？",
    recommendedAction: "record_next_step",
  };
  const requests: SproutRequest[] = [];
  await blockLegacyCompanionRoute(page);
  await page.route("**/api/sprout/analyze", async (route) => {
    requests.push(route.request().postDataJSON() as SproutRequest);
    expect(route.request().headers()["x-client-request-id"]).toBeTruthy();
    await fulfillSuggestion(route, suggestion);
  });
  await initializeGarden(context, page);
  await setDisclosureState(page, {
    openAi: "2026-07-24T08:00:00.000Z",
    sprout: null,
  });
  await createTextFragment(page, DISCLOSURE_TITLE, DISCLOSURE_BODY);

  let detailDialog = await openFragment(page, DISCLOSURE_TITLE);
  let sproutDialog = await openSprout(detailDialog);
  let disclosureDialog = page.getByRole("dialog", { name: "使用 AI 前，请先确认" });
  await expect(disclosureDialog).toBeVisible();
  expect((await readFragmentGardenPersistence(page)).openAiDisclosureAcceptedAt).not.toBeNull();
  expect((await readFragmentGardenPersistence(page)).sproutAiDisclosureAcceptedAt).toBeNull();

  await disclosureDialog.getByRole("button", { name: "暂不使用 AI" }).click();
  await expect(disclosureDialog).toBeHidden();
  await expect(sproutDialog.getByRole("heading", { name: "伙伴的基础观察" })).toBeVisible();
  expect(observations.sproutRequestCount).toBe(0);
  expect((await readFragmentGardenPersistence(page)).sproutAiDisclosureAcceptedAt).toBeNull();
  await sproutDialog.getByRole("button", { name: "返回" }).click();
  await expect(sproutDialog).toBeHidden();

  sproutDialog = await openSprout(detailDialog);
  disclosureDialog = page.getByRole("dialog", { name: "使用 AI 前，请先确认" });
  await expect(disclosureDialog).toBeVisible();
  await disclosureDialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(disclosureDialog).toBeHidden();
  await expect(sproutDialog).toBeHidden();
  expect(observations.sproutRequestCount).toBe(0);
  expect((await readFragmentGardenPersistence(page)).sproutAiDisclosureAcceptedAt).toBeNull();

  sproutDialog = await openSprout(detailDialog);
  disclosureDialog = page.getByRole("dialog", { name: "使用 AI 前，请先确认" });
  await expect(disclosureDialog).toBeVisible();
  await disclosureDialog.getByRole("button", { name: "同意并继续" }).click();
  await expect(disclosureDialog).toBeHidden();

  await expect(sproutDialog.getByRole("heading", { name: "伙伴建议" })).toBeVisible();
  await expect(sproutDialog.getByText(suggestion.direction, { exact: true })).toBeVisible();
  await expect(sproutDialog.getByText(suggestion.guidingQuestion, { exact: true })).toBeVisible();
  await expect(sproutDialog.getByText("写下下一步", { exact: true })).toBeVisible();
  await expect(sproutDialog).not.toContainText("recommendedAction");
  await expect(sproutDialog).not.toContainText("gpt-");
  expect(requests).toHaveLength(1);
  expect(requests[0]?.fragment.title).toBe(DISCLOSURE_TITLE);

  let persistence = findFragmentState(await readFragmentGardenPersistence(page), DISCLOSURE_TITLE);
  expect(persistence.fragment.rawText).toBe(DISCLOSURE_BODY);
  expect(persistence.partnerEvents).toEqual([]);
  expect(persistence.plant.growthScore).toBe(0);

  await sproutDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await closeDetail(detailDialog);
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  detailDialog = await openFragment(page, DISCLOSURE_TITLE);
  sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByRole("heading", { name: "伙伴建议" })).toBeVisible();
  await expect(disclosureDialog).toHaveCount(0);
  persistence = findFragmentState(await readFragmentGardenPersistence(page), DISCLOSURE_TITLE);
  expect(persistence.partnerEvents).toEqual([]);
  expect(persistence.plant.growthScore).toBe(0);
  expect((await readFragmentGardenPersistence(page)).sproutAiDisclosureAcceptedAt).not.toBeNull();
  await expectCleanBoundary(page, observations, 2);
});

test("replaces an unsaved direction and persists two later suggestions with one daily growth award", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  const suggestions: SproutSuggestion[] = [
    {
      type: "suggestion",
      direction: "先设计一次完整的邻里阅读活动。",
      guidingQuestion: "第一次活动准备邀请多少人？",
      recommendedAction: "keep_for_later",
    },
    {
      type: "suggestion",
      direction: "先整理一份适合交换的短篇书清单。",
      guidingQuestion: "你最希望第一批书满足什么阅读情境？",
      recommendedAction: "add_content",
    },
    {
      type: "suggestion",
      direction: "先记录一个让邻居留下读后想法的轻量方式。",
      guidingQuestion: "怎样记录才不会让参与者觉得有负担？",
      recommendedAction: "record_next_step",
    },
  ];
  const requests: SproutRequest[] = [];
  await blockLegacyCompanionRoute(page);
  await page.route("**/api/sprout/analyze", async (route) => {
    const requestIndex = requests.length;
    requests.push(route.request().postDataJSON() as SproutRequest);
    const suggestion = suggestions[requestIndex];
    if (suggestion === undefined) {
      throw new Error(`Unexpected sprout request ${requestIndex + 1}`);
    }
    await fulfillSuggestion(route, suggestion);
  });
  await initializeGarden(context, page);
  await setDisclosureState(page, { sprout: "2026-07-25T08:00:00.000Z" });
  await createTextFragment(page, ROTATION_TITLE, ROTATION_BODY);

  let detailDialog = await openFragment(page, ROTATION_TITLE);
  const sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByText(suggestions[0]!.direction, { exact: true })).toBeVisible();
  await sproutDialog.getByRole("button", { name: "换个方向" }).click();
  await expect(sproutDialog.getByText(suggestions[1]!.direction, { exact: true })).toBeVisible();
  expect(requests[1]?.avoidDirections).toEqual([suggestions[0]!.direction]);
  await sproutDialog.getByRole("button", { name: "保存这条建议" }).click();
  await expect(sproutDialog.getByText("这条建议已经记在这株植物旁边了。")).toBeVisible();

  await sproutDialog.getByRole("button", { name: "换个方向" }).click();
  await expect(sproutDialog.getByText(suggestions[2]!.direction, { exact: true })).toBeVisible();
  expect(requests[2]?.avoidDirections).toEqual([
    suggestions[0]!.direction,
    suggestions[1]!.direction,
  ]);
  await sproutDialog.getByRole("button", { name: "保存这条建议" }).click();
  await expect(sproutDialog.getByText("这条建议已经记在这株植物旁边了。")).toBeVisible();
  await sproutDialog.getByRole("button", { name: "关闭", exact: true }).click();

  let persistence = findFragmentState(await readFragmentGardenPersistence(page), ROTATION_TITLE);
  expect(persistence.fragment.rawText).toBe(ROTATION_BODY);
  expect(persistence.plant.growthScore).toBe(1);
  expect(persistence.plant.stage).toBe("growing");
  expect(persistence.partnerEvents).toHaveLength(2);
  expect(new Set(persistence.partnerEvents.map((event) => event.id)).size).toBe(2);
  expect(persistence.partnerEvents.map((event) => event.payload?.direction).sort()).toEqual(
    [suggestions[1]!.direction, suggestions[2]!.direction].sort(),
  );

  await closeDetail(detailDialog);
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  detailDialog = await openFragment(page, ROTATION_TITLE);
  await expect(detailDialog.getByText(ROTATION_BODY, { exact: true })).toBeVisible();
  persistence = findFragmentState(await readFragmentGardenPersistence(page), ROTATION_TITLE);
  expect(persistence.partnerEvents).toHaveLength(2);
  expect(persistence.plant.growthScore).toBe(1);
  await expectCleanBoundary(page, observations, 3);
});

test("preserves fragment states and opens existing follow-up flows without auto-executing them", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  const ACTIVE_TITLE = "活跃的社区菜谱";
  const DORMANT_TITLE = "休眠的散步路线";
  const COMPLETED_TITLE = "完成的阅读角";
  const ARCHIVED_TITLE = "封存的旅行专题";
  const COMPLETE_ACTION_TITLE = "等待完成确认的整理计划";
  const responseByTitle: Record<string, SproutSuggestion> = {
    [ACTIVE_TITLE]: {
      type: "suggestion",
      direction: "补充一道最适合第一次共做的菜。",
      guidingQuestion: "哪道菜最能降低第一次参与的门槛？",
      recommendedAction: "add_content",
    },
    [DORMANT_TITLE]: {
      type: "suggestion",
      direction: "先保留一条最想再次走过的路线。",
      guidingQuestion: "哪段路线最值得重新观察？",
      recommendedAction: "keep_for_later",
    },
    [COMPLETED_TITLE]: {
      type: "suggestion",
      direction: "把已经完成的阅读角延伸成一次交换书活动。",
      guidingQuestion: "现有参与者还愿意交换什么？",
      recommendedAction: "grow_new_idea",
    },
    [ARCHIVED_TITLE]: {
      type: "suggestion",
      direction: "保留一个将来重新整理旅行资料的入口。",
      guidingQuestion: "哪些资料最值得以后再看？",
      recommendedAction: "keep_for_later",
    },
    [COMPLETE_ACTION_TITLE]: {
      type: "suggestion",
      direction: "确认这份整理计划是否已经达到你最初的目标。",
      guidingQuestion: "现在还有哪一项结果没有收尾？",
      recommendedAction: "mark_completed",
    },
  };
  const requests: SproutRequest[] = [];
  await blockLegacyCompanionRoute(page);
  await page.route("**/api/sprout/analyze", async (route) => {
    const request = route.request().postDataJSON() as SproutRequest;
    requests.push(request);
    const suggestion = responseByTitle[request.fragment.title];
    if (suggestion === undefined) {
      throw new Error(`Unexpected fragment ${request.fragment.title}`);
    }
    await fulfillSuggestion(route, suggestion);
  });
  await initializeGarden(context, page);
  await setDisclosureState(page, { sprout: "2026-07-25T08:00:00.000Z" });
  await seedFragments(page, [
    {
      id: "sprout-active",
      title: ACTIVE_TITLE,
      rawText: "整理几道邻居愿意一起做的简单菜谱。",
      lifecycleStatus: "active",
      slotId: "slot-01",
    },
    {
      id: "sprout-dormant",
      title: DORMANT_TITLE,
      rawText: "记录几条适合下班后慢慢散步的路线。",
      lifecycleStatus: "dormant",
      slotId: "slot-02",
    },
    {
      id: "sprout-completed",
      title: COMPLETED_TITLE,
      rawText: "已经搭好一个可以安静读书和交换书的角落。",
      lifecycleStatus: "active",
      completionStatus: "completed",
      slotId: "slot-03",
    },
    {
      id: "sprout-archived",
      title: ARCHIVED_TITLE,
      rawText: "暂时收起按城市整理旧旅行照片的专题。",
      lifecycleStatus: "archived",
      slotId: null,
    },
    {
      id: "sprout-complete-action",
      title: COMPLETE_ACTION_TITLE,
      rawText: "把书桌上的旧资料按主题整理并写下去留结论。",
      lifecycleStatus: "active",
      slotId: "slot-04",
    },
  ]);
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();

  let detailDialog = await openFragment(page, ACTIVE_TITLE);
  let sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByText("补充一点内容", { exact: true })).toBeVisible();
  await sproutDialog.getByRole("button", { name: "保存这条建议" }).click();
  await expect(sproutDialog.getByRole("status")).toContainText("已经记在");
  await sproutDialog.getByRole("button", { name: "按建议继续" }).click();
  await expect(detailDialog.getByRole("heading", { name: "追加一条笔记" })).toBeVisible();
  await expect(detailDialog.getByLabel("追加笔记内容")).toBeFocused();
  let persisted = findFragmentState(await readFragmentGardenPersistence(page), ACTIVE_TITLE);
  expect(persisted.fragment.lifecycleStatus).toBe("active");
  expect(persisted.plant.growthScore).toBe(1);
  await closeDetail(detailDialog);

  detailDialog = await openFragment(page, DORMANT_TITLE);
  sproutDialog = await openSprout(detailDialog);
  await sproutDialog.getByRole("button", { name: "保存这条建议" }).click();
  await expect(sproutDialog.getByRole("status")).toContainText("已经记在");
  await sproutDialog.getByRole("button", { name: "关闭", exact: true }).click();
  persisted = findFragmentState(await readFragmentGardenPersistence(page), DORMANT_TITLE);
  expect(persisted.fragment.lifecycleStatus).toBe("active");
  expect(persisted.partnerEvents).toHaveLength(1);
  expect(
    (await readFragmentGardenPersistence(page)).fragmentEvents.filter(
      (event) => event.fragmentId === persisted.fragment.id && event.type === "restored",
    ),
  ).toHaveLength(1);
  await closeDetail(detailDialog);

  detailDialog = await openFragment(page, COMPLETED_TITLE);
  sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByText("发展成一个新想法", { exact: true })).toBeVisible();
  await expect(sproutDialog).not.toContainText("标记为完成");
  await sproutDialog.getByRole("button", { name: "保存这条建议" }).click();
  await expect(sproutDialog.getByRole("status")).toContainText("已经记在");
  await sproutDialog.getByRole("button", { name: "按建议继续" }).click();
  await expect(detailDialog.getByRole("status")).toContainText("这条方向没有自动执行");
  persisted = findFragmentState(await readFragmentGardenPersistence(page), COMPLETED_TITLE);
  expect(persisted.fragment.completionStatus).toBe("completed");
  expect(persisted.plant.stage).toBe("permanent_bloom");
  await closeDetail(detailDialog);

  detailDialog = await openFragment(page, ARCHIVED_TITLE);
  sproutDialog = await openSprout(detailDialog);
  await sproutDialog.getByRole("button", { name: "保存这条建议" }).click();
  await expect(sproutDialog.getByRole("status")).toContainText("已经记在");
  await sproutDialog.getByRole("button", { name: "关闭", exact: true }).click();
  persisted = findFragmentState(await readFragmentGardenPersistence(page), ARCHIVED_TITLE);
  expect(persisted.fragment.lifecycleStatus).toBe("archived");
  expect(persisted.plant.slotId).toBeNull();
  await closeDetail(detailDialog);

  detailDialog = await openFragment(page, COMPLETE_ACTION_TITLE);
  sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByText("标记为完成", { exact: true })).toBeVisible();
  await sproutDialog.getByRole("button", { name: "按建议继续" }).click();
  await expect(detailDialog.getByRole("status")).toContainText("这条方向没有自动执行");
  persisted = findFragmentState(await readFragmentGardenPersistence(page), COMPLETE_ACTION_TITLE);
  expect(persisted.fragment.completionStatus).toBe("open");
  expect(persisted.partnerEvents).toEqual([]);

  const completedRequest = requests.find((request) => request.fragment.title === COMPLETED_TITLE);
  expect(completedRequest?.fragment.isCompleted).toBe(true);
  expect(completedRequest?.fragment.isArchived).toBe(false);
  const archivedRequest = requests.find((request) => request.fragment.title === ARCHIVED_TITLE);
  expect(archivedRequest?.fragment.lifecycleStatus).toBe("archived");
  expect(archivedRequest?.fragment.isArchived).toBe(true);
  await expectCleanBoundary(page, observations, 5);
});

test("normalizes rate limiting and timeout failures without fake suggestions or writes", async ({
  context,
  page,
}) => {
  const observations = observeNetwork(page);
  let responseIndex = 0;
  await blockLegacyCompanionRoute(page);
  await page.route("**/api/sprout/analyze", async (route) => {
    responseIndex += 1;
    const isRateLimit = responseIndex === 1;
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: isRateLimit ? "rate_limited" : "request_timeout",
          message: isRateLimit ? "Please retry later" : "Provider request timed out",
        },
      }),
      contentType: "application/json",
      status: isRateLimit ? 429 : 504,
    });
  });
  await initializeGarden(context, page);
  await setDisclosureState(page, { sprout: "2026-07-25T08:00:00.000Z" });
  await createTextFragment(page, FAILURE_TITLE, FAILURE_BODY);

  const detailDialog = await openFragment(page, FAILURE_TITLE);
  const sproutDialog = await openSprout(detailDialog);
  await expect(sproutDialog.getByRole("heading", { name: "伙伴暂时没能找到方向" })).toBeVisible();
  await expect(sproutDialog.getByRole("alert")).toContainText("现在请求有些多");
  await expect(sproutDialog.getByRole("button", { name: "补充内容" })).toBeVisible();
  await expect(sproutDialog.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(sproutDialog.getByRole("button", { name: "返回" })).toBeVisible();
  await expect(sproutDialog.getByRole("button", { name: "保存这条建议" })).toHaveCount(0);

  let persisted = findFragmentState(await readFragmentGardenPersistence(page), FAILURE_TITLE);
  expect(persisted.partnerEvents).toEqual([]);
  expect(persisted.plant.growthScore).toBe(0);
  await sproutDialog.getByRole("button", { name: "重试" }).click();
  await expect(sproutDialog.getByRole("alert")).toContainText("伙伴这次看得有些久");
  persisted = findFragmentState(await readFragmentGardenPersistence(page), FAILURE_TITLE);
  expect(persisted.fragment.rawText).toBe(FAILURE_BODY);
  expect(persisted.partnerEvents).toEqual([]);
  expect(persisted.plant.growthScore).toBe(0);
  await expectCleanBoundary(page, observations, 2);
});
