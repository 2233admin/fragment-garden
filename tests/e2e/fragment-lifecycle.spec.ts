import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const DORMANT_TITLE = "等待重新发现的想法";
const COMPLETED_TITLE = "把阅读角真正搭起来";
const CHILD_TITLE = "阅读角的第一场分享";
const ARCHIVED_TITLE = "暂时收好的旅行清单";
const ARCHIVED_COMPLETED_PARENT_TITLE = "已经完成的社区读书会";
const ARCHIVED_PARENT_CHILD_TITLE = "读书会长出的交换书架";

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

async function createTextFragment(page: Page, title: string, rawText: string): Promise<void> {
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await dialog.getByLabel("标题（可选）").fill(title);
  await dialog.getByLabel("内容").fill(rawText);
  await dialog.getByRole("button", { name: "种下", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: `打开碎片：${title}` })).toBeVisible();
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
            request.result as Array<{
              id: string;
              title: string;
              lastInteractedAt: string;
            }>
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

async function readFragmentSlot(page: Page, title: string): Promise<string | null> {
  return page.evaluate(
    async ({ fragmentTitle }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const result = await new Promise<string | null>((resolve, reject) => {
        const transaction = database.transaction(["fragments", "plants"], "readonly");
        const fragmentRequest = transaction.objectStore("fragments").getAll();
        fragmentRequest.onerror = () => reject(fragmentRequest.error);
        fragmentRequest.onsuccess = () => {
          const fragment = (
            fragmentRequest.result as Array<{
              id: string;
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
            const plant = plantRequest.result as { slotId: string | null } | undefined;
            resolve(plant?.slotId ?? null);
          };
        };
      });

      database.close();
      return result;
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
        const transaction = database.transaction("fragmentEvents", "readonly");
        const request = transaction.objectStore("fragmentEvents").index("type").count(eventType);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      database.close();
      return count;
    },
    { eventType: type },
  );
}

test("persists automatic dormancy and restores through the same plant detail flow", async ({
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
  const dormantCard = page.getByRole("button", { name: `打开碎片：${DORMANT_TITLE}` });
  await expect(dormantCard).toContainText("休眠");
  await expect.poll(() => countEvents(page, "dormant")).toBe(1);

  await selectMode(page, "花园模式");
  const summary = page.getByTestId("garden-accessibility-summary");
  await expect(summary.getByText(new RegExp(`${DORMANT_TITLE}.*休眠`, "u"))).toBeAttached();

  await clickCanvasWorld(page, 112, 60);
  const detail = page.getByRole("dialog", { name: DORMANT_TITLE });
  await expect(detail).toBeVisible({ timeout: 12_000 });
  await expect(detail.getByText("活跃", { exact: true }).first()).toBeVisible();
  await expect.poll(() => countEvents(page, "restored")).toBe(1);
  await detail.getByRole("button", { name: "关闭详情" }).click();

  await expect(summary.getByText(new RegExp(`${DORMANT_TITLE}.*活跃`, "u"))).toBeAttached();
  await selectMode(page, "卡片模式");
  await expect(dormantCard).toContainText("活跃");

  await makeFragmentOlderThanDormancyThreshold(page, DORMANT_TITLE);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dormantCard).toContainText("休眠");
  await expect.poll(() => countEvents(page, "dormant")).toBe(2);
  expect(pageErrors).toEqual([]);
});

test("keeps permanent bloom while growing and opening a related child idea", async ({
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
  await page.getByRole("button", { name: `打开碎片：${COMPLETED_TITLE}` }).click();

  let parentDetail = page.getByRole("dialog", { name: COMPLETED_TITLE });
  await parentDetail.getByLabel("添加新补充").fill("先清出一块可以坐下的位置。");
  await parentDetail.getByRole("button", { name: "保存补充" }).click();
  await expect(parentDetail.getByText(/成长分\s*[：:]\s*1/u)).toBeVisible();

  await parentDetail.getByRole("button", { name: "标记为已完成" }).click();
  const completionDialog = page.getByRole("dialog", { name: "标记为已完成" });
  await completionDialog.getByLabel("它最后变成了什么？（可选）").fill("真的搭好了阅读角");
  await completionDialog.getByRole("button", { name: "确认完成" }).click();
  await expect(completionDialog).toBeHidden();
  await expect(parentDetail.getByText(/成长阶段\s*[：:]\s*永久盛开/u)).toBeVisible();
  await expect(parentDetail.getByText("真的搭好了阅读角", { exact: true })).toBeVisible();

  await parentDetail.getByLabel("添加新补充").fill("坐下来读完了第一篇短篇。");
  await parentDetail.getByRole("button", { name: "保存补充" }).click();
  await expect(parentDetail.getByText(/成长阶段\s*[：:]\s*永久盛开/u)).toBeVisible();

  await parentDetail.getByRole("button", { name: "让它长成一个新想法" }).click();
  const childDialog = page.getByRole("dialog", { name: "让它长成一个新想法" });
  await childDialog.getByLabel("新想法标题（可选）").fill(CHILD_TITLE);
  await childDialog.getByLabel("新想法内容").fill("邀请朋友来交换一本最近喜欢的书。");
  await childDialog.getByRole("button", { name: "种下新想法" }).click();
  await expect(childDialog).toBeHidden();
  await parentDetail.getByRole("button", { name: "打开新想法" }).click();

  const childDetail = page.getByRole("dialog", { name: CHILD_TITLE });
  await expect(childDetail).toBeVisible();
  await expect(childDetail.getByText(COMPLETED_TITLE, { exact: true })).toBeVisible();
  await childDetail.getByRole("button", { name: "关闭详情" }).click();

  await expect(page.getByRole("button", { name: `打开碎片：${CHILD_TITLE}` })).toBeVisible();
  await page.getByRole("button", { name: `打开碎片：${COMPLETED_TITLE}` }).click();
  parentDetail = page.getByRole("dialog", { name: COMPLETED_TITLE });
  await expect(parentDetail.getByText(CHILD_TITLE, { exact: true })).toBeVisible();
  await expect(parentDetail.getByText("已完成", { exact: true }).first()).toBeVisible();
  await parentDetail.getByRole("button", { name: "关闭详情" }).click();

  await selectMode(page, "花园模式");
  const summary = page.getByTestId("garden-accessibility-summary");
  await expect(summary).toHaveAttribute("data-plant-count", "2");
  await expect(summary.locator('li[data-stage="permanent_bloom"]')).toHaveCount(1);
  await expect(summary.locator('li[data-stage="seedling"]')).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("records no-longer-needed only after archive confirmation and restores its slot", async ({
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
  const originalSlotId = await readFragmentSlot(page, ARCHIVED_TITLE);
  expect(originalSlotId).not.toBeNull();

  await page.getByRole("button", { name: `打开碎片：${ARCHIVED_TITLE}` }).click();
  let detail = page.getByRole("dialog", { name: ARCHIVED_TITLE });
  await detail.getByRole("button", { name: "不再需要" }).click();
  const dispositionDialog = page.getByRole("alertdialog", {
    name: "这条碎片不再需要了吗？",
  });
  await dispositionDialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dispositionDialog).toBeHidden();
  await expect(detail).toBeVisible();
  await expect.poll(() => countEvents(page, "reviewed")).toBe(0);

  await detail.getByRole("button", { name: "不再需要" }).click();
  await dispositionDialog.getByRole("button", { name: "封存", exact: true }).click();
  await expect(dispositionDialog).toBeHidden();
  await expect(detail.getByRole("button", { name: "恢复到花园" })).toBeVisible();
  await expect.poll(() => countEvents(page, "reviewed")).toBe(1);
  await detail.getByRole("button", { name: "关闭详情" }).click();

  await expect(page.getByRole("button", { name: `打开碎片：${ARCHIVED_TITLE}` })).toHaveCount(0);
  await selectMode(page, "花园模式");
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "0",
  );
  await selectMode(page, "卡片模式");
  await page.getByRole("button", { name: "已封存", exact: true }).click();
  await page.getByLabel("搜索碎片").fill("旅行清单");
  await expect(page.getByRole("button", { name: `打开碎片：${ARCHIVED_TITLE}` })).toBeVisible();
  await page.getByRole("button", { name: `打开碎片：${ARCHIVED_TITLE}` }).click();

  detail = page.getByRole("dialog", { name: ARCHIVED_TITLE });
  await expect(detail.getByText(/封存/u).first()).toBeVisible();
  await detail.getByRole("button", { name: "恢复到花园" }).click();
  await expect(detail.getByText(/内容已恢复到花园/u)).toBeVisible();
  await detail.getByRole("button", { name: "关闭详情" }).click();

  await page.getByRole("button", { name: "当前", exact: true }).click();
  await page.getByLabel("搜索碎片").fill("");
  await expect(page.getByRole("button", { name: `打开碎片：${ARCHIVED_TITLE}` })).toBeVisible();
  await selectMode(page, "花园模式");
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "1",
  );
  expect(await readFragmentSlot(page, ARCHIVED_TITLE)).not.toBeNull();
  expect(pageErrors).toEqual([]);
});

test("keeps review gates and archived completed parent-child state consistent", async ({
  context,
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await clearIndexedDb(context, page);

  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await selectMode(page, "卡片模式");
  await createTextFragment(
    page,
    ARCHIVED_COMPLETED_PARENT_TITLE,
    "社区读书会已经办完，但还可以从这次经验长出新的方向。",
  );
  await page.getByRole("button", { name: `打开碎片：${ARCHIVED_COMPLETED_PARENT_TITLE}` }).click();

  let parentDetail = page.getByRole("dialog", { name: ARCHIVED_COMPLETED_PARENT_TITLE });
  await parentDetail.getByRole("button", { name: "暂时用不上" }).click();
  await expect(
    parentDetail.getByText("它会先安静地休息，想起来时再来看就好。", { exact: true }),
  ).toBeVisible();
  await expect(parentDetail.getByText("休眠", { exact: true }).first()).toBeVisible();

  await parentDetail.getByRole("button", { name: "仍然感兴趣" }).click();
  await expect(
    parentDetail.getByText("已经记下，你以后还可以再回来看看。", { exact: true }),
  ).toBeVisible();
  await expect(parentDetail.getByText("活跃", { exact: true }).first()).toBeVisible();

  await parentDetail.getByRole("button", { name: "标记为已完成" }).click();
  const completionDialog = page.getByRole("dialog", { name: "标记为已完成" });
  await completionDialog
    .getByLabel("它最后变成了什么？（可选）")
    .fill("办成了一次轻松的社区读书会");
  await completionDialog.getByRole("button", { name: "确认完成" }).click();
  await expect(completionDialog).toBeHidden();
  await expect(parentDetail.getByText("已完成", { exact: true }).first()).toBeVisible();
  await expect(parentDetail.getByText(/成长阶段\s*[：:]\s*永久盛开/u)).toBeVisible();
  await expect(parentDetail.getByRole("button", { name: "暂时用不上" })).toHaveCount(0);
  await expect(parentDetail.getByRole("button", { name: "标记为已完成" })).toHaveCount(0);
  await expect(parentDetail.getByRole("button", { name: "仍然感兴趣" })).toBeVisible();

  await parentDetail.getByRole("button", { name: "不再需要" }).click();
  const dispositionDialog = page.getByRole("alertdialog", {
    name: "这条碎片不再需要了吗？",
  });
  await dispositionDialog.getByRole("button", { name: "封存", exact: true }).click();
  await expect(dispositionDialog).toBeHidden();
  await expect(parentDetail.getByText("已封存", { exact: true }).first()).toBeVisible();
  await expect(parentDetail.getByText("已完成", { exact: true }).first()).toBeVisible();
  await expect(parentDetail.getByRole("button", { name: "恢复到花园" })).toBeVisible();
  await expect(parentDetail.getByRole("heading", { name: "这条碎片现在怎么样？" })).toHaveCount(0);
  await expect(parentDetail.getByRole("button", { name: "仍然感兴趣" })).toHaveCount(0);
  await expect(parentDetail.getByRole("button", { name: "不再需要" })).toHaveCount(0);
  await parentDetail.getByRole("button", { name: "关闭详情" }).click();

  const parentCard = page.getByRole("button", {
    name: `打开碎片：${ARCHIVED_COMPLETED_PARENT_TITLE}`,
  });
  await expect(parentCard).toHaveCount(0);
  await page.getByRole("button", { name: "已完成", exact: true }).click();
  await expect(parentCard).toHaveCount(0);
  await page.getByRole("button", { name: "已封存", exact: true }).click();
  await expect(parentCard).toBeVisible();
  await expect(parentCard).toContainText("已封存");
  await expect(parentCard).toContainText("已完成");

  await selectMode(page, "花园模式");
  await expect(page.getByTestId("garden-accessibility-summary")).toHaveAttribute(
    "data-plant-count",
    "0",
  );
  await selectMode(page, "卡片模式");
  await parentCard.click();

  parentDetail = page.getByRole("dialog", { name: ARCHIVED_COMPLETED_PARENT_TITLE });
  await parentDetail.getByRole("button", { name: "让它长成一个新想法" }).click();
  const childDialog = page.getByRole("dialog", { name: "让它长成一个新想法" });
  await childDialog.getByLabel("新想法标题（可选）").fill(ARCHIVED_PARENT_CHILD_TITLE);
  await childDialog.getByLabel("新想法内容").fill("搭一个可以自由交换读完书籍的小书架。");
  await childDialog.getByRole("button", { name: "种下新想法" }).click();
  await expect(childDialog).toBeHidden();
  await expect(parentDetail.getByText(ARCHIVED_PARENT_CHILD_TITLE, { exact: true })).toBeVisible();
  await expect(parentDetail.getByText("已封存", { exact: true }).first()).toBeVisible();
  await expect(parentDetail.getByText("已完成", { exact: true }).first()).toBeVisible();
  await parentDetail.getByRole("button", { name: "关闭详情" }).click();

  await expect(parentCard).toBeVisible();
  await page.getByRole("button", { name: "当前", exact: true }).click();
  await expect(parentCard).toHaveCount(0);
  const childCard = page.getByRole("button", {
    name: `打开碎片：${ARCHIVED_PARENT_CHILD_TITLE}`,
  });
  await expect(childCard).toBeVisible();
  await expect(childCard).toContainText("活跃");

  await selectMode(page, "花园模式");
  const summary = page.getByTestId("garden-accessibility-summary");
  await expect(summary).toHaveAttribute("data-plant-count", "1");
  await expect(
    summary.getByText(new RegExp(`${ARCHIVED_PARENT_CHILD_TITLE}.*幼苗.*活跃`, "u")),
  ).toBeAttached();
  await expect(summary.locator('li[data-stage="permanent_bloom"]')).toHaveCount(0);

  await selectMode(page, "卡片模式");
  await childCard.click();
  const childDetail = page.getByRole("dialog", { name: ARCHIVED_PARENT_CHILD_TITLE });
  await expect(
    childDetail.getByText(ARCHIVED_COMPLETED_PARENT_TITLE, { exact: true }),
  ).toBeVisible();
  await expect(childDetail.getByText("活跃", { exact: true }).first()).toBeVisible();
  await expect(childDetail.getByText("未完成", { exact: true }).first()).toBeVisible();
  await childDetail.getByRole("button", { name: "关闭详情" }).click();

  expect(pageErrors).toEqual([]);
});
