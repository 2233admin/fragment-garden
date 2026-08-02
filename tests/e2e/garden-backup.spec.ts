import { readFile, writeFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  BACKUP_CHILD_TITLE,
  BACKUP_IMAGE_TITLE,
  BACKUP_SOURCE_TITLE,
  clearAllGardenTables,
  exportGardenBackupFromDialog,
  seedGardenBackupFixture,
  selectBackupFile,
} from "./helpers/garden-backup";
import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

async function restoreSelectedBackup(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(dialog.getByText("备份检查通过。确认前不会修改当前花园。")).toBeVisible();
  await dialog.getByRole("button", { name: "用这份备份恢复", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "用备份替换当前花园？" });
  await expect(confirmation).toBeVisible();
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
  await confirmation.getByRole("button", { name: "确认恢复", exact: true }).click();
  await navigation;
  await expect(page.getByTestId("garden-interaction-status")).toHaveText("花园已经恢复完成。");
}

async function requireDownloadPath(
  download: Awaited<ReturnType<typeof exportGardenBackupFromDialog>>,
) {
  const path = await download.path();
  if (path === null) throw new Error("Playwright did not provide the backup download path");
  return path;
}

test.beforeEach(async ({ context, page }) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required");
  await page.goto("/garden");
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
});

test("exports and safely restores notes, image Blob, additions, and sprout relations", async ({
  page,
}) => {
  await seedGardenBackupFixture(page);
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  const backupPath = await requireDownloadPath(await exportGardenBackupFromDialog(page));

  await clearAllGardenTables(page);
  await selectBackupFile(page, backupPath);
  const backupDialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(backupDialog.getByText("笔记", { exact: true }).locator("..")).toContainText("3");
  await expect(backupDialog.getByText("植物", { exact: true }).locator("..")).toContainText("3");
  await expect(backupDialog.getByText("追加笔记", { exact: true }).locator("..")).toContainText(
    "2",
  );
  await expect(backupDialog.getByText("发芽关系", { exact: true }).locator("..")).toContainText(
    "1",
  );
  await restoreSelectedBackup(page);

  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `打开笔记：${BACKUP_SOURCE_TITLE}` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: `打开笔记：${BACKUP_CHILD_TITLE}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `打开笔记：${BACKUP_IMAGE_TITLE}` })).toBeVisible();

  await page.getByRole("button", { name: `打开笔记：${BACKUP_SOURCE_TITLE}` }).click();
  let detail = page.getByRole("dialog", { name: BACKUP_SOURCE_TITLE });
  await expect(detail.getByText("第一条恢复用追加笔记。", { exact: true })).toBeVisible();
  await expect(detail.getByText("第二条恢复用追加笔记。", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: `查看「${BACKUP_CHILD_TITLE}」`, exact: true }).click();
  detail = page.getByRole("dialog", { name: BACKUP_CHILD_TITLE });
  await expect(
    detail.getByRole("button", { name: `发芽自「${BACKUP_SOURCE_TITLE}」`, exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "返回", exact: true }).click();

  await page.getByRole("button", { name: `打开笔记：${BACKUP_IMAGE_TITLE}` }).click();
  const imageDetail = page.getByRole("dialog", { name: BACKUP_IMAGE_TITLE });
  await expect(imageDetail.getByAltText(`用户上传的图片：${BACKUP_IMAGE_TITLE}`)).toBeVisible();
  const state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(3);
  expect(state.plants).toHaveLength(3);
  expect(state.fragmentNotes).toHaveLength(2);
  expect(state.fragmentRelations).toHaveLength(1);
  expect(state.mediaAssets).toHaveLength(1);
  expect(state.mediaAssets[0]?.blobSize).toBeGreaterThan(0);
  await expect.poll(() => page.locator("canvas").count()).toBeLessThanOrEqual(1);
});

test("rejects a damaged backup without changing the current garden", async ({ page }, testInfo) => {
  await seedGardenBackupFixture(page, { currentOnly: true });
  const validPath = await requireDownloadPath(await exportGardenBackupFromDialog(page));
  const container = JSON.parse(await readFile(validPath, "utf8")) as {
    manifest: { app: string };
  };
  container.manifest.app = "another-product";
  const damagedPath = testInfo.outputPath("damaged-backup.json");
  await writeFile(damagedPath, JSON.stringify(container), "utf8");

  await selectBackupFile(page, damagedPath);
  const dialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(dialog.getByRole("alert")).toContainText("备份文件无法读取");
  await expect(dialog.getByRole("button", { name: "用这份备份恢复" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "打开笔记：恢复前的当前笔记" })).toBeVisible();
  expect((await readFragmentGardenPersistence(page)).fragments).toHaveLength(1);
});

test("rolls back a failed replacement without leaving partial notes or media", async ({ page }) => {
  await seedGardenBackupFixture(page);
  const backupPath = await requireDownloadPath(await exportGardenBackupFromDialog(page));
  await seedGardenBackupFixture(page, { currentOnly: true });
  await selectBackupFile(page, backupPath);
  await page.evaluate(() => {
    const scope = window as Window & { __failGardenRestoreWrite?: boolean };
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function patchedPut(value: unknown, key?: IDBValidKey) {
      if (
        scope.__failGardenRestoreWrite === true &&
        this.transaction.db.name === "fragment-garden" &&
        this.name === "plants"
      ) {
        throw new DOMException("simulated restore write failure", "UnknownError");
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    };
    scope.__failGardenRestoreWrite = true;
  });

  const dialog = page.getByRole("dialog", { name: "数据与备份" });
  await dialog.getByRole("button", { name: "用这份备份恢复", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "用备份替换当前花园？" });
  await confirmation.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(confirmation.getByRole("alert")).toContainText("原来的星空档案没有被修改");
  await confirmation.getByRole("button", { name: "取消", exact: true }).click();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await completeCompanionOnboardingIfNeeded(page);
  const state = await readFragmentGardenPersistence(page);
  expect(state.fragments.map((fragment) => fragment.id)).toEqual(["current-only"]);
  expect(state.plants.map((plant) => plant.id)).toEqual(["current-only-plant"]);
  expect(state.mediaAssets).toEqual([]);
});

test("restores interrupted tasks as manual retries without provider calls", async ({ page }) => {
  const providerCalls: string[] = [];
  for (const routePattern of [
    "**/api/link-imports/start",
    "**/api/link-imports/progress",
    "**/api/media/image/analyze",
    "**/api/sprout/generate",
  ]) {
    await page.route(routePattern, async (route) => {
      providerCalls.push(new URL(route.request().url()).pathname);
      await route.abort();
    });
  }

  await seedGardenBackupFixture(page, { currentOnly: true, includeInterruptedJobs: true });
  const backupPath = await requireDownloadPath(await exportGardenBackupFromDialog(page));
  await clearAllGardenTables(page);
  await selectBackupFile(page, backupPath);
  await restoreSelectedBackup(page);
  await expect(page.getByRole("button", { name: /3 条内容需要处理/u })).toBeVisible();

  const state = await readFragmentGardenPersistence(page);
  expect(state.fragments).toHaveLength(1);
  expect(state.plants).toHaveLength(1);
  expect(state.contentProcessingJobs).toHaveLength(3);
  expect(state.contentProcessingJobs.map((job) => job.status)).toEqual([
    "failed",
    "failed",
    "failed",
  ]);
  expect(state.contentProcessingJobs.find((job) => job.kind === "image")?.blobSize).toBeGreaterThan(
    0,
  );
  expect(providerCalls).toEqual([]);
  await expect.poll(() => page.locator("canvas").count()).toBeLessThanOrEqual(1);
});
