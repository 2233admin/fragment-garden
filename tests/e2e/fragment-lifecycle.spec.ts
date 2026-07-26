import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const DORMANT_TITLE = "等待重新发现的想法";
const COMPLETED_TITLE = "把阅读角真正搭起来";
const CHILD_TITLE = "阅读角的第一场分享";
const ARCHIVED_TITLE = "暂时收好的旅行清单";

type StoredFragmentSnapshot = Readonly<{
  completionStatus: string;
  fragmentId: string;
  growthScore: number;
  lifecycleStatus: string;
  slotId: string | null;
  stage: string;
}>;

async function clearIndexedDb(context: BrowserContext, page: Page): Promise<void> {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("The Playwright project must define a baseURL.");

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
  await expect(page.getByRole("button", { name: `打开笔记：${title}` })).toBeVisible();
}

async function clickCanvasWorld(page: Page, worldX: number, worldY: number): Promise<void> {
  const canvas = page.getByTestId("garden-canvas-host").locator("canvas");
  const scale = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const bounds = canvasElement.getBoundingClientRect();
    return { x: bounds.width / canvasElement.width, y: bounds.height / canvasElement.height };
  });

  await canvas.click({ position: { x: worldX * scale.x, y: worldY * scale.y } });
}

async function makeFragmentOlderThanDormancyThreshold(page: Page, title: string): Promise<void> {
  await page.evaluate(
    async ({ fragmentTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("fragments", "readwrite");
        const store = transaction.objectStore("fragments");
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const fragment = (
            request.result as Array<{ title: string; lastInteractedAt: string }>
          ).find((candidate) => candidate.title === fragmentTitle);
          if (fragment === undefined) {
            reject(new Error(`Fragment ${fragmentTitle} was not found`));
            return;
          }
          fragment.lastInteractedAt = new Date(Date.now() - 73 * 60 * 60 * 1_000).toISOString();
          store.put(fragment);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { fragmentTitle: title },
  );
}

async function readFragmentSnapshot(page: Page, title: string): Promise<StoredFragmentSnapshot> {
  return page.evaluate(
    async ({ fragmentTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const snapshot = await new Promise<StoredFragmentSnapshot>((resolve, reject) => {
        const transaction = database.transaction(["fragments", "plants"], "readonly");
        const fragmentRequest = transaction.objectStore("fragments").getAll();
        fragmentRequest.onerror = () => reject(fragmentRequest.error);
        fragmentRequest.onsuccess = () => {
          const fragment = (
            fragmentRequest.result as Array<{
              completionStatus: string;
              id: string;
              lifecycleStatus: string;
              title: string;
            }>
          ).find((candidate) => candidate.title === fragmentTitle);
          if (fragment === undefined) {
            reject(new Error(`Fragment ${fragmentTitle} was not found`));
            return;
          }

          const plantRequest = transaction
            .objectStore("plants")
            .index("fragmentId")
            .get(fragment.id);
          plantRequest.onerror = () => reject(plantRequest.error);
          plantRequest.onsuccess = () => {
            const plant = plantRequest.result as
              { growthScore: number; slotId: string | null; stage: string } | undefined;
            if (plant === undefined) {
              reject(new Error(`Plant for ${fragmentTitle} was not found`));
              return;
            }
            resolve({
              completionStatus: fragment.completionStatus,
              fragmentId: fragment.id,
              growthScore: plant.growthScore,
              lifecycleStatus: fragment.lifecycleStatus,
              slotId: plant.slotId,
              stage: plant.stage,
            });
          };
        };
      });
      database.close();
      return snapshot;
    },
    { fragmentTitle: title },
  );
}

async function countEvents(page: Page, type: string): Promise<number> {
  return page.evaluate(
    async ({ eventType }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const count = await new Promise<number>((resolve, reject) => {
        const request = database
          .transaction("fragmentEvents", "readonly")
          .objectStore("fragmentEvents")
          .index("type")
          .count(eventType);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      database.close();
      return count;
    },
    { eventType: type },
  );
}

async function prepareCompletedRelation(
  page: Page,
  parentTitle: string,
  childTitle: string,
): Promise<void> {
  await page.evaluate(
    async ({ childFragmentTitle, parentFragmentTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(["fragments", "plants", "relations"], "readwrite");
        const fragmentStore = transaction.objectStore("fragments");
        const fragmentsRequest = fragmentStore.getAll();
        fragmentsRequest.onerror = () => reject(fragmentsRequest.error);
        fragmentsRequest.onsuccess = () => {
          const fragments = fragmentsRequest.result as Array<{
            completedAt: string | null;
            completionStatus: string;
            id: string;
            title: string;
            updatedAt: string;
          }>;
          const parent = fragments.find((fragment) => fragment.title === parentFragmentTitle);
          const child = fragments.find((fragment) => fragment.title === childFragmentTitle);
          if (parent === undefined || child === undefined) {
            reject(new Error("Parent or child Fragment was not found"));
            return;
          }

          const now = new Date().toISOString();
          parent.completionStatus = "completed";
          parent.completedAt = now;
          parent.updatedAt = now;
          fragmentStore.put(parent);

          const plantRequest = transaction.objectStore("plants").index("fragmentId").get(parent.id);
          plantRequest.onerror = () => reject(plantRequest.error);
          plantRequest.onsuccess = () => {
            const plant = plantRequest.result as { stage: string; updatedAt: string } | undefined;
            if (plant === undefined) {
              reject(new Error("Parent Plant was not found"));
              return;
            }
            plant.stage = "permanent_bloom";
            plant.updatedAt = now;
            transaction.objectStore("plants").put(plant);
          };

          transaction.objectStore("relations").put({
            confirmedAt: now,
            createdAt: now,
            explanation: null,
            id: crypto.randomUUID(),
            relationType: "grows_from",
            similarityScore: null,
            sourceFragmentId: child.id,
            status: "confirmed",
            targetFragmentId: parent.id,
          });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { childFragmentTitle: childTitle, parentFragmentTitle: parentTitle },
  );
}

async function prepareArchivedCompletedFragment(page: Page, title: string): Promise<void> {
  await page.evaluate(
    async ({ fragmentTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(["fragments", "plants"], "readwrite");
        const fragmentStore = transaction.objectStore("fragments");
        const fragmentsRequest = fragmentStore.getAll();
        fragmentsRequest.onerror = () => reject(fragmentsRequest.error);
        fragmentsRequest.onsuccess = () => {
          const fragment = (
            fragmentsRequest.result as Array<{
              completedAt: string | null;
              completionStatus: string;
              id: string;
              lifecycleStatus: string;
              title: string;
              updatedAt: string;
            }>
          ).find((candidate) => candidate.title === fragmentTitle);
          if (fragment === undefined) {
            reject(new Error(`Fragment ${fragmentTitle} was not found`));
            return;
          }

          const now = new Date().toISOString();
          fragment.lifecycleStatus = "archived";
          fragment.completionStatus = "completed";
          fragment.completedAt = now;
          fragment.updatedAt = now;
          fragmentStore.put(fragment);

          const plantRequest = transaction
            .objectStore("plants")
            .index("fragmentId")
            .get(fragment.id);
          plantRequest.onerror = () => reject(plantRequest.error);
          plantRequest.onsuccess = () => {
            const plant = plantRequest.result as
              { slotId: string | null; stage: string; updatedAt: string } | undefined;
            if (plant === undefined) {
              reject(new Error("Plant was not found"));
              return;
            }
            plant.slotId = null;
            plant.stage = "permanent_bloom";
            plant.updatedAt = now;
            transaction.objectStore("plants").put(plant);
          };
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { fragmentTitle: title },
  );
}

async function addNoteFromDetail(
  detail: ReturnType<Page["getByRole"]>,
  text: string,
): Promise<void> {
  await detail.getByRole("button", { name: "追加笔记", exact: true }).click();
  await detail.getByLabel("追加笔记内容").fill(text);
  await detail.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(detail.getByText(text, { exact: true })).toBeVisible();
}

test("persists automatic dormancy and restores without exposing lifecycle in cards or details", async ({
  context,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await clearIndexedDb(context, page);

  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await selectMode(page, "卡片模式");
  await createTextFragment(page, DORMANT_TITLE, "先把这个想法放在花园里，过几天再回来。");
  await makeFragmentOlderThanDormancyThreshold(page, DORMANT_TITLE);
  await page.reload();

  await selectMode(page, "卡片模式");
  const card = page.getByRole("button", { name: `打开笔记：${DORMANT_TITLE}` });
  await expect(card).not.toContainText(/休眠|活跃|成长分|成长阶段/u);
  await expect
    .poll(async () => (await readFragmentSnapshot(page, DORMANT_TITLE)).lifecycleStatus)
    .toBe("dormant");
  await expect.poll(() => countEvents(page, "dormant")).toBe(1);

  await selectMode(page, "花园模式");
  const summary = page.getByTestId("garden-accessibility-summary");
  await expect(summary.getByText(new RegExp(`${DORMANT_TITLE}.*休眠`, "u"))).toBeAttached();
  await clickCanvasWorld(page, 112, 60);

  const detail = page.getByRole("dialog", { name: DORMANT_TITLE });
  await expect(detail).toBeVisible({ timeout: 12_000 });
  await expect(detail).not.toContainText(/内容状态|成长分|成长阶段|成长与状态记录/u);
  await expect
    .poll(async () => (await readFragmentSnapshot(page, DORMANT_TITLE)).lifecycleStatus)
    .toBe("active");
  await expect.poll(() => countEvents(page, "restored")).toBe(1);
  await detail.getByRole("button", { name: "返回", exact: true }).click();
  await expect(summary.getByText(new RegExp(`${DORMANT_TITLE}.*活跃`, "u"))).toBeAttached();

  await makeFragmentOlderThanDormancyThreshold(page, DORMANT_TITLE);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect
    .poll(async () => (await readFragmentSnapshot(page, DORMANT_TITLE)).lifecycleStatus)
    .toBe("dormant");
  await expect.poll(() => countEvents(page, "dormant")).toBe(2);
  expect(pageErrors).toEqual([]);
});

test("keeps completed plants permanently blooming while notes and relations stay content-first", async ({
  context,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await clearIndexedDb(context, page);

  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await selectMode(page, "卡片模式");
  await createTextFragment(page, COMPLETED_TITLE, "整理窗边，搭一个真的会使用的阅读角。");
  await createTextFragment(page, CHILD_TITLE, "邀请朋友来交换一本最近喜欢的书。");
  await prepareCompletedRelation(page, COMPLETED_TITLE, CHILD_TITLE);
  await page.reload();
  await selectMode(page, "卡片模式");

  const parentCard = page.getByRole("button", { name: `打开笔记：${COMPLETED_TITLE}` });
  await expect(parentCard).not.toContainText(/已完成|永久盛开|成长分|成长阶段/u);
  await parentCard.click();
  const parentDetail = page.getByRole("dialog", { name: COMPLETED_TITLE });
  await addNoteFromDetail(parentDetail, "先清出一块可以坐下的位置。");
  await expect(parentDetail).not.toContainText(/已完成|永久盛开|成长分|成长阶段/u);

  const parentSnapshot = await readFragmentSnapshot(page, COMPLETED_TITLE);
  expect(parentSnapshot.completionStatus).toBe("completed");
  expect(parentSnapshot.stage).toBe("permanent_bloom");
  expect(parentSnapshot.growthScore).toBe(1);

  await parentDetail.getByRole("button", { name: `延伸到「${CHILD_TITLE}」` }).click();
  const childDetail = page.getByRole("dialog", { name: CHILD_TITLE });
  await expect(
    childDetail.getByRole("button", { name: `源自「${COMPLETED_TITLE}」` }),
  ).toBeVisible();
  await expect(childDetail).not.toContainText(/活跃|未完成|成长分|成长阶段/u);
  await childDetail.getByRole("button", { name: "返回", exact: true }).click();

  await selectMode(page, "花园模式");
  const summary = page.getByTestId("garden-accessibility-summary");
  await expect(summary).toHaveAttribute("data-plant-count", "2");
  await expect(summary.locator('li[data-stage="permanent_bloom"]')).toHaveCount(1);
  await expect(summary.locator('li[data-stage="seedling"]')).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("keeps archived completed content readable and editable without restoring its garden slot", async ({
  context,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await clearIndexedDb(context, page);

  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await selectMode(page, "卡片模式");
  await createTextFragment(page, ARCHIVED_TITLE, "先收好这份旅行清单，等季节合适时再回来。");
  await prepareArchivedCompletedFragment(page, ARCHIVED_TITLE);
  await page.reload();
  await selectMode(page, "卡片模式");

  const archivedCard = page.getByRole("button", { name: `打开笔记：${ARCHIVED_TITLE}` });
  await expect(archivedCard).toBeVisible();
  await expect(archivedCard).not.toContainText(/已封存|已完成|永久盛开|成长分/u);
  await archivedCard.click();

  const detail = page.getByRole("dialog", { name: ARCHIVED_TITLE });
  await expect(
    detail.getByText("先收好这份旅行清单，等季节合适时再回来。", { exact: true }),
  ).toBeVisible();
  await expect(detail.getByRole("button", { name: "恢复到花园" })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "标记为已完成" })).toHaveCount(0);
  await expect(detail).not.toContainText(/已封存|已完成|永久盛开|成长阶段|成长分/u);
  await addNoteFromDetail(detail, "补记：先保留春天适合去的两个地点。");

  const snapshot = await readFragmentSnapshot(page, ARCHIVED_TITLE);
  expect(snapshot.lifecycleStatus).toBe("archived");
  expect(snapshot.completionStatus).toBe("completed");
  expect(snapshot.stage).toBe("permanent_bloom");
  expect(snapshot.slotId).toBeNull();
  expect(snapshot.growthScore).toBe(1);
  await detail.getByRole("button", { name: "返回", exact: true }).click();

  await selectMode(page, "花园模式");
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "0",
  );
  expect(pageErrors).toEqual([]);
});
