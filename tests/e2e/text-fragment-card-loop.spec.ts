import { expect, test, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";

const RAW_TEXT = "在周末搭一个安静的阅读角\n把窗边整理出来。";
const GENERATED_TITLE = "在周末搭一个安静的阅读角";
const SEARCH_TERM = "窗边整理";
const UPDATED_TITLE = "周末阅读角计划";
const UPDATED_BODY = "把窗边改造成可以每天坐十分钟的阅读角。";
const UPDATED_BODY_SEARCH_TERM = "每天坐十分钟";
const NOTE_TEXT = "先挑一本短篇小说。";
const UPDATED_NOTE_TEXT = "先挑一本短篇小说，再把阅读灯放到窗边。";

type StoredTextState = Readonly<{
  fragmentId: string;
  contentMarkdown: string;
  rawText: string | null;
  notes: ReadonlyArray<
    Readonly<{
      contentMarkdown: string;
      id: string;
    }>
  >;
}>;

type StoredPlantGrowth = Readonly<{
  growthScore: number;
  stage: string;
}>;

function getTextCard(page: Page, title: string) {
  return page.getByRole("button", { name: `打开笔记：${title}` });
}

async function expectAtMostOneCanvas(page: Page): Promise<void> {
  await expect.poll(async () => page.locator("canvas").count()).toBeLessThanOrEqual(1);
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

async function readStoredTextState(page: Page): Promise<StoredTextState> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (!database.objectStoreNames.contains("fragmentNotes")) {
      database.close();
      throw new Error("The V5 fragmentNotes store is missing");
    }

    const transaction = database.transaction(["fragments", "fragmentNotes"], "readonly");
    const readAll = <T>(storeName: string): Promise<T[]> =>
      new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      });
    const [fragments, notes] = await Promise.all([
      readAll<{
        contentMarkdown?: string;
        contentType: string;
        id: string;
        rawText: string | null;
      }>("fragments"),
      readAll<{
        contentMarkdown: string;
        fragmentId: string;
        id: string;
      }>("fragmentNotes"),
    ]);
    const fragment = fragments.find((candidate) => candidate.contentType === "text");

    database.close();
    if (fragment === undefined) {
      throw new Error("The text Fragment was not found");
    }

    return {
      fragmentId: fragment.id,
      contentMarkdown: fragment.contentMarkdown ?? "",
      rawText: fragment.rawText,
      notes: notes
        .filter((note) => note.fragmentId === fragment.id)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((note) => ({ id: note.id, contentMarkdown: note.contentMarkdown })),
    };
  });
}

async function readStoredPlantGrowth(page: Page): Promise<StoredPlantGrowth> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction(["fragments", "plants"], "readonly");
    const readAll = <T>(storeName: string): Promise<T[]> =>
      new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      });
    const [fragments, plants] = await Promise.all([
      readAll<{ contentType: string; id: string }>("fragments"),
      readAll<{ fragmentId: string; growthScore: number; stage: string }>("plants"),
    ]);
    const fragment = fragments.find((candidate) => candidate.contentType === "text");
    const plant = plants.find((candidate) => candidate.fragmentId === fragment?.id);

    database.close();
    if (plant === undefined) {
      throw new Error("The text Fragment Plant was not found");
    }

    return {
      growthScore: plant.growthScore,
      stage: plant.stage,
    };
  });
}

async function expectContentOnlyDetail(page: Page, title: string): Promise<void> {
  const detail = page.getByRole("dialog", { name: title });

  await expect(detail.getByRole("button", { name: "返回", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "编辑", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "删除", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "追加笔记", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "发芽", exact: true })).toBeVisible();

  await expect(detail.getByText(/成长分|成长阶段|生命周期|处理状态/u)).toHaveCount(0);
  await expect(detail.getByText("种下了这条碎片", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("补充了一段新内容", { exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "标记完成", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "封存", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "发展成新想法", exact: true })).toHaveCount(0);
}

test("keeps the text note flow content-first across edits, notes, and refreshes", async ({
  context,
  page,
}) => {
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

  await test.step("create a text note and keep the existing card/search loop", async () => {
    await page.goto("/garden");
    await completeCompanionOnboardingIfNeeded(page);
    await expect(page.getByRole("heading", { name: "碎片宇宙" })).toBeVisible();
    await expectAtMostOneCanvas(page);

    await page.getByRole("button", { name: "卡片模式", exact: true }).click();
    await expect(page.getByText("还没有种下碎片", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "种下碎片", exact: true }).click();

    const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
    await expect(createDialog.getByLabel("标题（可选）")).toHaveValue("");
    await createDialog.getByLabel("内容").fill(RAW_TEXT);
    await createDialog.getByRole("button", { name: "种下", exact: true }).click();
    await expect(createDialog).toBeHidden();
    await expect(getTextCard(page, GENERATED_TITLE)).toBeVisible();

    await page.reload();
    await completeCompanionOnboardingIfNeeded(page);
    await page.getByRole("button", { name: "卡片模式", exact: true }).click();
    await page.getByLabel("搜索碎片").fill(SEARCH_TERM);
    await expect(getTextCard(page, GENERATED_TITLE)).toBeVisible();
    await expectAtMostOneCanvas(page);
  });

  await test.step("show content without lifecycle, growth, processing, or system-event UI", async () => {
    await getTextCard(page, GENERATED_TITLE).click();
    const detail = page.getByRole("dialog", { name: GENERATED_TITLE });

    await expect(detail).toContainText("在周末搭一个安静的阅读角");
    await expect(detail).toContainText("把窗边整理出来。");
    await expect(
      detail.getByText("还没有追加笔记。新的资料、判断或进展可以单独记在这里。", { exact: true }),
    ).toBeVisible();
    await expectContentOnlyDetail(page, GENERATED_TITLE);
    await expect.poll(() => countViewedEvents(page)).toBe(1);
    await expectAtMostOneCanvas(page);
  });

  let editedBodyMarkdown = "";

  await test.step("edit the title and Markdown body in one form", async () => {
    const detail = page.getByRole("dialog", { name: GENERATED_TITLE });
    await detail.getByRole("button", { name: "编辑", exact: true }).click();

    await detail.getByRole("textbox", { name: "标题", exact: true }).fill(UPDATED_TITLE);
    const bodyEditor = detail.getByRole("textbox", { name: "编辑主体内容", exact: true });
    await bodyEditor.fill(UPDATED_BODY);
    await detail
      .getByRole("toolbar", { name: "文字格式" })
      .getByRole("button", { name: "标题", exact: true })
      .click();
    await detail.getByRole("button", { name: "保存修改", exact: true }).click();

    const updatedDetail = page.getByRole("dialog", { name: UPDATED_TITLE });
    await expect(updatedDetail).toBeVisible();
    await expect(
      updatedDetail.getByRole("heading", { name: UPDATED_BODY, level: 2 }),
    ).toBeVisible();

    const stored = await readStoredTextState(page);
    editedBodyMarkdown = stored.contentMarkdown;
    expect(editedBodyMarkdown).toContain(UPDATED_BODY);
    expect(stored.rawText).toBe(RAW_TEXT);
    expect(stored.notes).toEqual([]);
  });

  await test.step("create and edit an independent appended note without merging the body", async () => {
    const detail = page.getByRole("dialog", { name: UPDATED_TITLE });
    await detail.getByRole("button", { name: "追加笔记", exact: true }).click();
    await detail.getByRole("textbox", { name: "追加笔记内容", exact: true }).fill(NOTE_TEXT);
    await detail.getByRole("button", { name: "保存笔记", exact: true }).click();
    await expect(detail.getByText(NOTE_TEXT, { exact: true })).toBeVisible();

    const afterCreate = await readStoredTextState(page);
    expect(afterCreate.contentMarkdown).toBe(editedBodyMarkdown);
    expect(afterCreate.notes).toHaveLength(1);
    expect(afterCreate.notes[0]?.contentMarkdown).toContain(NOTE_TEXT);

    await detail.getByRole("button", { name: "编辑第 1 条追加笔记" }).click();
    await detail
      .getByRole("textbox", { name: "编辑第 1 条追加笔记", exact: true })
      .fill(UPDATED_NOTE_TEXT);
    await detail.getByRole("button", { name: "保存修改", exact: true }).click();
    await expect(detail.getByText(UPDATED_NOTE_TEXT, { exact: true })).toBeVisible();
    await expect(detail.getByText(NOTE_TEXT, { exact: true })).toHaveCount(0);

    const afterEdit = await readStoredTextState(page);
    expect(afterEdit.contentMarkdown).toBe(editedBodyMarkdown);
    expect(afterEdit.notes).toHaveLength(1);
    expect(afterEdit.notes[0]?.contentMarkdown).toContain(UPDATED_NOTE_TEXT);
    await expectContentOnlyDetail(page, UPDATED_TITLE);
  });

  await test.step("persist the unified edit and edited note across refresh", async () => {
    const detail = page.getByRole("dialog", { name: UPDATED_TITLE });
    await detail.getByRole("button", { name: "返回", exact: true }).click();
    await expect(getTextCard(page, UPDATED_TITLE)).toBeVisible();

    await page.reload();
    await completeCompanionOnboardingIfNeeded(page);
    await page.getByRole("button", { name: "卡片模式", exact: true }).click();
    await page.getByLabel("搜索碎片").fill(UPDATED_BODY_SEARCH_TERM);
    await expect(getTextCard(page, UPDATED_TITLE)).toBeVisible();
    await getTextCard(page, UPDATED_TITLE).click();

    const refreshedDetail = page.getByRole("dialog", { name: UPDATED_TITLE });
    await expect(
      refreshedDetail.getByRole("heading", { name: UPDATED_BODY, level: 2 }),
    ).toBeVisible();
    await expect(refreshedDetail.getByText(UPDATED_NOTE_TEXT, { exact: true })).toBeVisible();
    await expect.poll(() => countViewedEvents(page)).toBe(2);
    await expectContentOnlyDetail(page, UPDATED_TITLE);
    await expectAtMostOneCanvas(page);
  });

  await test.step("delete only the appended note and keep the body after another refresh", async () => {
    const detail = page.getByRole("dialog", { name: UPDATED_TITLE });
    await detail.getByRole("button", { name: "删除第 1 条追加笔记" }).click();

    const confirm = page.getByRole("alertdialog", { name: "删除这条追加笔记？" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "删除笔记", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect(detail.getByText(UPDATED_NOTE_TEXT, { exact: true })).toHaveCount(0);
    await expect(
      detail.getByText("还没有追加笔记。新的资料、判断或进展可以单独记在这里。", { exact: true }),
    ).toBeVisible();

    const afterDelete = await readStoredTextState(page);
    expect(afterDelete.contentMarkdown).toBe(editedBodyMarkdown);
    expect(afterDelete.notes).toEqual([]);

    await detail.getByRole("button", { name: "返回", exact: true }).click();
    await page.reload();
    await completeCompanionOnboardingIfNeeded(page);
    await page.getByRole("button", { name: "卡片模式", exact: true }).click();
    await getTextCard(page, UPDATED_TITLE).click();

    const finalDetail = page.getByRole("dialog", { name: UPDATED_TITLE });
    await expect(finalDetail.getByRole("heading", { name: UPDATED_BODY, level: 2 })).toBeVisible();
    await expect(finalDetail.getByText(UPDATED_NOTE_TEXT, { exact: true })).toHaveCount(0);
    expect((await readStoredTextState(page)).contentMarkdown).toBe(editedBodyMarkdown);
    await expectAtMostOneCanvas(page);
  });
});

test("grows once for every independently saved appended note", async ({ context, page }) => {
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

  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();

  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByLabel("标题（可选）").fill("连续成长测试");
  await createDialog.getByLabel("内容").fill("每一条独立追加都应该推动植物成长。");
  await createDialog.getByRole("button", { name: "种下", exact: true }).click();
  await getTextCard(page, "连续成长测试").click();

  const detail = page.getByRole("dialog", { name: "连续成长测试" });
  for (let index = 1; index <= 5; index += 1) {
    const note = `第 ${index} 条独立追加`;
    await detail.getByRole("button", { name: "追加笔记", exact: true }).click();
    await detail.getByRole("textbox", { name: "追加笔记内容", exact: true }).fill(note);
    await detail.getByRole("button", { name: "保存笔记", exact: true }).click();
    await expect(detail.getByText(note, { exact: true })).toBeVisible();
    await expect.poll(async () => (await readStoredPlantGrowth(page)).growthScore).toBe(index);
  }

  await expect.poll(async () => (await readStoredPlantGrowth(page)).stage).toBe("blooming");
});
