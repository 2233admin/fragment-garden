import { expect, test, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const RAW_TEXT = "在周末搭一个安静的阅读角\n把窗边整理出来。";
const GENERATED_TITLE = "在周末搭一个安静的阅读角";
const SEARCH_TERM = "窗边整理";
const SUPPLEMENT_TEXT = "先挑一本短篇小说。";
const UPDATED_TITLE = "周末阅读角计划";

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

test("completes the text fragment card loop", async ({ context, page }) => {
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

  await test.step("1. 打开页面并进入卡片工作区", async () => {
    await page.goto("/garden");
    await completeCompanionOnboardingIfNeeded(page);
    await expect(page.getByRole("heading", { name: "碎片花园" })).toBeVisible();
    await page.getByRole("button", { name: "卡片模式", exact: true }).click();
    await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  await test.step("2. 显示空状态", async () => {
    await expect(page.getByText("还没有种下碎片", { exact: true })).toBeVisible();
  });

  await test.step("3. 打开文字碎片创建对话框", async () => {
    await page.getByRole("button", { name: "种下碎片", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "种下文字碎片" })).toBeVisible();
  });

  await test.step("4. 不填写标题并输入多行文字", async () => {
    const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
    await expect(createDialog.getByLabel("标题（可选）")).toHaveValue("");
    await createDialog.getByLabel("内容").fill(RAW_TEXT);
  });

  await test.step("5. 保存文字碎片", async () => {
    const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
    await createDialog.getByRole("button", { name: "种下", exact: true }).click();
    await expect(createDialog).toBeHidden();
  });

  await test.step("6. 新卡片立即出现", async () => {
    await expect(page.getByRole("button", { name: `打开碎片：${GENERATED_TITLE}` })).toBeVisible();
  });

  await test.step("7. 刷新页面", async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "碎片花园" })).toBeVisible();
    await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  });

  await test.step("8. 刷新后卡片仍然存在", async () => {
    await expect(page.getByRole("button", { name: `打开碎片：${GENERATED_TITLE}` })).toBeVisible();
  });

  await test.step("9. 可以通过原始内容搜索", async () => {
    await page.getByLabel("搜索碎片").fill(SEARCH_TERM);
    await expect(page.getByRole("button", { name: `打开碎片：${GENERATED_TITLE}` })).toBeVisible();
  });

  await test.step("10. 打开碎片详情", async () => {
    await page.getByRole("button", { name: `打开碎片：${GENERATED_TITLE}` }).click();
    await expect(page.getByRole("dialog", { name: GENERATED_TITLE })).toBeVisible();
    await expect.poll(() => countViewedEvents(page)).toBe(1);
  });

  await test.step("11. 添加文字补充", async () => {
    const detailDialog = page.getByRole("dialog", { name: GENERATED_TITLE });
    await detailDialog.getByLabel("添加新补充").fill(SUPPLEMENT_TEXT);
    await detailDialog.getByRole("button", { name: "保存补充" }).click();
    await expect(detailDialog.getByText(SUPPLEMENT_TEXT, { exact: true })).toBeVisible();
    await expect(detailDialog.getByLabel("添加新补充")).toHaveValue("");
  });

  await test.step("12. 成长分和阶段立即变化", async () => {
    const detailDialog = page.getByRole("dialog", { name: GENERATED_TITLE });
    await expect(detailDialog.getByText(/成长分\s*[：:]\s*1/)).toBeVisible();
    await expect(detailDialog.getByText(/成长阶段\s*[：:]\s*(生长|growing)/i)).toBeVisible();
  });

  await test.step("13. 修改标题", async () => {
    const detailDialog = page.getByRole("dialog", { name: GENERATED_TITLE });
    await detailDialog.getByLabel("编辑标题").fill(UPDATED_TITLE);
    await detailDialog.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("dialog", { name: UPDATED_TITLE })).toBeVisible();
  });

  await test.step("14. 关闭详情", async () => {
    const detailDialog = page.getByRole("dialog", { name: UPDATED_TITLE });
    await detailDialog.getByRole("button", { name: "关闭详情" }).click();
    await expect(detailDialog).toBeHidden();
  });

  await test.step("15. 卡片显示修改后的标题", async () => {
    await expect(page.getByRole("button", { name: `打开碎片：${UPDATED_TITLE}` })).toBeVisible();
  });

  await test.step("16. 重新打开并确认软删除", async () => {
    await page.getByRole("button", { name: `打开碎片：${UPDATED_TITLE}` }).click();
    const detailDialog = page.getByRole("dialog", { name: UPDATED_TITLE });
    await expect.poll(() => countViewedEvents(page)).toBe(2);
    await detailDialog.getByRole("button", { name: "删除碎片" }).click();

    const confirmDialog = page.getByRole("alertdialog", { name: "确认删除碎片" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(detailDialog).toBeVisible();

    await detailDialog.getByRole("button", { name: "删除碎片" }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "确认删除", exact: true }).click();
  });

  await test.step("17. 卡片从默认列表消失", async () => {
    await expect(page.getByRole("button", { name: `打开碎片：${UPDATED_TITLE}` })).toHaveCount(0);
  });
});
