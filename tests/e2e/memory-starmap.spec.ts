import { expect, test, type Locator, type Page } from "@playwright/test";

import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

const RECORD_TITLE = "夜晚散步时想到的事";
const RECORD_BODY = "把今天没有说完的判断先留下来。";
const NOTE_BODY = "第二天再看时，我仍然认同这个方向。";

type ClientPoint = Readonly<{ clientX: number; clientY: number }>;

type TextSaveTransitionObservation = {
  launchingDialogStyle: {
    backgroundImage: string;
    borderColor: string;
    boxShadow: string;
  } | null;
  phases: string[];
  starBounds: { height: number; width: number } | null;
  target: ClientPoint | null;
};

type DetailTransitionHandoffSample = Readonly<{
  compactOpacity: number | null;
  hasCompact: boolean;
  hasExpanded: boolean;
  hasTransition: boolean;
  expandedContentOpacity: number | null;
  isExpandedOpen: boolean;
}>;

const TEXT_SAVE_OBSERVATION_ATTRIBUTE = "data-text-save-transition-observation";
const DETAIL_HANDOFF_OBSERVATION_ATTRIBUTE = "data-detail-handoff-observation";

async function readTransitionTarget(transition: Locator): Promise<ClientPoint> {
  const { clientX, clientY } = await transition.evaluate((element) => ({
    clientX: Number(element.getAttribute("data-target-client-x")),
    clientY: Number(element.getAttribute("data-target-client-y")),
  }));
  expect(Number.isFinite(clientX)).toBe(true);
  expect(Number.isFinite(clientY)).toBe(true);
  return { clientX, clientY };
}

async function installTextSaveTransitionObserver(page: Page): Promise<void> {
  await page.evaluate((attributeName) => {
    const observation: TextSaveTransitionObservation = {
      launchingDialogStyle: null,
      phases: [],
      starBounds: null,
      target: null,
    };
    let hasSeenTransition = false;
    let previousPhase: string | null = null;

    const publish = (): void => {
      document.documentElement.setAttribute(attributeName, JSON.stringify(observation));
    };
    const observer = new MutationObserver(() => {
      const transition = document.querySelector<HTMLElement>('[data-testid="record-save-morph"]');
      const phase = transition?.dataset.savePhase ?? null;
      if (phase === previousPhase) return;
      previousPhase = phase;

      if (transition === null) {
        if (hasSeenTransition) {
          observation.phases.push("complete");
          publish();
          observer.disconnect();
        }
        return;
      }

      hasSeenTransition = true;
      observation.phases.push(phase ?? "unknown");
      if (phase === "expand") {
        const dialog = transition.closest("dialog");
        if (dialog !== null) {
          const style = window.getComputedStyle(dialog);
          observation.launchingDialogStyle = {
            backgroundImage: style.backgroundImage,
            borderColor: style.borderTopColor,
            boxShadow: style.boxShadow,
          };
        }
        observation.target = {
          clientX: Number(transition.dataset.targetClientX),
          clientY: Number(transition.dataset.targetClientY),
        };
      }
      if (phase === "star") {
        const morph = transition.querySelector<HTMLElement>(
          ".memory-record-save-transition__morph",
        );
        if (morph !== null) {
          const captureStarBounds = (): void => {
            if (!morph.isConnected || observation.starBounds !== null) return;
            const bounds = morph.getBoundingClientRect();
            if (
              bounds.width <= 140 &&
              bounds.height <= 140 &&
              Math.abs(bounds.width - bounds.height) <= 2
            ) {
              observation.starBounds = {
                height: bounds.height,
                width: bounds.width,
              };
              publish();
              return;
            }
            window.requestAnimationFrame(captureStarBounds);
          };
          window.requestAnimationFrame(captureStarBounds);
        }
      }
      publish();
    });

    observer.observe(document.body, {
      attributeFilter: ["data-save-phase"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    publish();
  }, TEXT_SAVE_OBSERVATION_ATTRIBUTE);
}

async function readTextSaveTransitionObservation(
  page: Page,
): Promise<TextSaveTransitionObservation> {
  const serialized = await page.locator("html").getAttribute(TEXT_SAVE_OBSERVATION_ATTRIBUTE);
  if (serialized === null) throw new Error("Text save transition observer was not installed.");
  return JSON.parse(serialized) as TextSaveTransitionObservation;
}

async function installDetailHandoffObserver(page: Page): Promise<void> {
  await page.evaluate((attributeName) => {
    const samples: DetailTransitionHandoffSample[] = [];
    let hasSeenTransition = false;

    const publish = (): void => {
      document.documentElement.setAttribute(attributeName, JSON.stringify(samples));
    };
    const observer = new MutationObserver(() => {
      const transition = document.querySelector(".memory-star-detail-transition-surface");
      const compact = document.querySelector<HTMLElement>('[data-detail-presentation="compact"]');
      const expanded = document.querySelector<HTMLDialogElement>(
        "dialog.memory-star-detail-dialog",
      );
      const expandedContent = expanded?.querySelector<HTMLElement>(
        ".memory-star-detail-dialog-content",
      );

      if (transition !== null) hasSeenTransition = true;
      if (!hasSeenTransition) return;

      samples.push({
        compactOpacity: compact === null ? null : Number(window.getComputedStyle(compact).opacity),
        expandedContentOpacity:
          expandedContent === null || expandedContent === undefined
            ? null
            : Number(window.getComputedStyle(expandedContent).opacity),
        hasCompact: compact !== null,
        hasExpanded: expanded !== null,
        hasTransition: transition !== null,
        isExpandedOpen: expanded?.open ?? false,
      });
      publish();

      if (transition === null && (compact !== null || expanded !== null)) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      attributeFilter: ["class", "open"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    publish();
  }, DETAIL_HANDOFF_OBSERVATION_ATTRIBUTE);
}

async function readDetailHandoffObservation(page: Page): Promise<DetailTransitionHandoffSample[]> {
  const serialized = await page.locator("html").getAttribute(DETAIL_HANDOFF_OBSERVATION_ATTRIBUTE);
  if (serialized === null) throw new Error("Detail handoff observer was not installed.");
  return JSON.parse(serialized) as DetailTransitionHandoffSample[];
}

async function expectAnchoredStarmapDetail(
  page: Page,
  detail: Locator,
  starPosition: ClientPoint,
): Promise<void> {
  await expect(detail).toHaveAttribute("data-appearance", "starmap");
  await expect(detail).toHaveAttribute("data-anchored", "true");

  const bounds = await detail.boundingBox();
  const viewport = page.viewportSize();
  if (bounds === null || viewport === null) {
    throw new Error("Anchored memory detail has no measurable viewport bounds.");
  }

  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

  const doesCoverStar =
    starPosition.clientX >= bounds.x &&
    starPosition.clientX <= bounds.x + bounds.width &&
    starPosition.clientY >= bounds.y &&
    starPosition.clientY <= bounds.y + bounds.height;
  expect(doesCoverStar).toBe(false);

  const horizontalGap =
    bounds.x >= starPosition.clientX
      ? bounds.x - starPosition.clientX
      : starPosition.clientX - (bounds.x + bounds.width);
  expect(horizontalGap).toBeGreaterThanOrEqual(8);
  expect(horizontalGap).toBeLessThanOrEqual(64);

  // The first created star is deliberately reframed near the viewport centre.
  // Its detail must therefore use that anchor instead of the former fixed right rail.
  expect(viewport.width - (bounds.x + bounds.width)).toBeGreaterThan(32);
}

async function openBackupFromSettings(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await settingsDialog.getByRole("button", { name: /^数据备份/u }).click();
  return page.getByRole("dialog", { name: "数据与备份" });
}

test("uses a three-item dock for recording, the archive placeholder, and settings", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required.");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.goto("/garden");
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();

  const dock = page.getByRole("navigation", { name: "星空主要操作" });
  const dockButtons = dock.getByRole("button");
  await expect(dockButtons).toHaveCount(3);
  await expect(dockButtons.nth(0)).toHaveAttribute("aria-label", "记录内容");
  await expect(dockButtons.nth(1)).toHaveAttribute("aria-label", "星星仓库");
  await expect(dockButtons.nth(2)).toHaveAttribute("aria-label", "设置");

  const recordBoundsBeforeHover = await dockButtons.nth(0).boundingBox();
  await dockButtons.nth(0).hover();
  const recordBoundsAfterHover = await dockButtons.nth(0).boundingBox();
  expect(recordBoundsAfterHover?.width).toBe(recordBoundsBeforeHover?.width);
  expect(recordBoundsAfterHover?.height).toBe(recordBoundsBeforeHover?.height);

  await dockButtons.nth(1).click();
  const archiveDialog = page.getByRole("dialog", { name: "星星仓库" });
  await expect(archiveDialog.getByText("暂未开放", { exact: true })).toBeVisible();
  await archiveDialog.getByRole("button", { name: "关闭", exact: true }).click();

  await dockButtons.nth(2).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await expect(settingsDialog.getByRole("button", { name: /^数据备份/u })).toBeEnabled();
  await expect(settingsDialog.getByRole("button", { name: /^动效/u })).toBeDisabled();
  await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();

  await dockButtons.nth(1).focus();
  await dockButtons.nth(2).hover();
  await expect(dock.locator("span")).toHaveCount(1);
  await expect(dock.locator("span")).toHaveText("设置");

  await expect(page.locator("canvas")).toHaveCount(1);
});

test("completes the memory starmap record, revisit, append, backup, and delete loop", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required.");

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.goto("/garden");

  await expect(page.getByRole("heading", { name: "碎片宇宙", level: 1 })).toBeVisible();
  await expect(page.getByText("星空正在等待第一条记录", { exact: true })).toBeVisible();
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);

  const canvasDimensions = await page.locator("canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return { height: canvas.height, width: canvas.width };
  });
  expect(canvasDimensions.width).toBeGreaterThan(0);
  expect(canvasDimensions.height).toBeGreaterThan(0);

  await page.getByRole("button", { name: "点亮第一颗星", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "记录此刻" });
  await expect(createDialog).toHaveAttribute("data-appearance", "starmap");
  await expect(createDialog.getByLabel("标题（可选）")).toHaveCount(0);
  await expect(
    createDialog.getByText("先在本地保存内容。标题留空时，会从第一行自动生成。"),
  ).toHaveCount(0);
  const textMode = createDialog.getByRole("button", { name: "文字", exact: true });
  const linkMode = createDialog.getByRole("button", { name: "链接", exact: true });
  const imageMode = createDialog.getByRole("button", { name: "图片", exact: true });
  await expect(textMode).toHaveAttribute("aria-pressed", "true");
  await textMode.press("ArrowRight");
  await expect(linkMode).toHaveAttribute("aria-pressed", "true");
  await expect(createDialog.getByLabel("补充内容（可选）")).toBeVisible();
  await linkMode.press("ArrowRight");
  await expect(imageMode).toHaveAttribute("aria-pressed", "true");
  await imageMode.press("Home");
  await expect(textMode).toHaveAttribute("aria-pressed", "true");
  await createDialog.getByLabel("内容", { exact: true }).fill(`${RECORD_TITLE}\n${RECORD_BODY}`);
  await createDialog.getByRole("button", { name: "保存记录", exact: true }).click();
  const transition = page.getByTestId("record-save-morph");
  await expect(transition).toHaveAttribute("data-save-phase", "reduced");
  const contentStarPosition = await readTransitionTarget(transition);
  await expect(createDialog).toBeHidden();
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();

  const storedAfterCreate = await readFragmentGardenPersistence(page);
  expect(storedAfterCreate.fragments).toHaveLength(1);
  const createdFragment = storedAfterCreate.fragments[0];
  if (createdFragment === undefined) throw new Error("Created fragment was not persisted.");
  expect(createdFragment.title).toBe(RECORD_TITLE);
  await expect(transition).toHaveCount(0);
  const canvas = page.locator("canvas");
  const canvasBounds = await canvas.boundingBox();
  if (canvasBounds === null) throw new Error("Memory starmap canvas has no visible bounds.");
  expect(contentStarPosition.clientX).toBeGreaterThanOrEqual(canvasBounds.x);
  expect(contentStarPosition.clientX).toBeLessThanOrEqual(canvasBounds.x + canvasBounds.width);
  expect(contentStarPosition.clientY).toBeGreaterThanOrEqual(canvasBounds.y);
  expect(contentStarPosition.clientY).toBeLessThanOrEqual(canvasBounds.y + canvasBounds.height);
  await page.mouse.move(contentStarPosition.clientX, contentStarPosition.clientY);
  await expect(page.locator(".memory-starmap-tooltip")).toHaveText(RECORD_TITLE);
  await page.mouse.click(contentStarPosition.clientX, contentStarPosition.clientY);

  const preview = page.getByRole("dialog", { name: RECORD_TITLE });
  await expectAnchoredStarmapDetail(page, preview, contentStarPosition);
  await expect(preview).toHaveAttribute("data-detail-presentation", "compact");
  await preview.getByRole("button", { name: "展开详情", exact: true }).click();
  await expect(page.locator(".memory-star-detail-transition-layer")).toHaveCount(0);
  const detail = page.getByRole("dialog", { name: RECORD_TITLE });
  await expect(detail).toHaveClass(/memory-star-detail-dialog/);
  await expect(detail.getByText(RECORD_BODY)).toBeVisible();
  await expect(
    detail.getByText("还没有追加笔记。新的资料、判断或进展可以单独记在这里。", { exact: true }),
  ).toHaveCount(0);
  await detail.getByRole("button", { name: "追加笔记", exact: true }).click();
  const noteComposer = detail.getByRole("textbox", { name: "追加笔记内容", exact: true });
  await expect(detail.getByRole("button", { name: "收起详情", exact: true })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "关闭详情", exact: true })).toBeDisabled();
  await detail.getByRole("button", { name: "链接", exact: true }).click();
  const linkInput = detail.getByLabel("链接地址", { exact: true });
  await linkInput.fill("not-a-link");
  await detail.getByRole("button", { name: "插入链接", exact: true }).click();
  await expect(
    detail.getByText("请输入 http、https 或 mailto 地址。", { exact: true }),
  ).toBeVisible();
  await expect(noteComposer).toBeVisible();
  expect((await readFragmentGardenPersistence(page)).fragmentNotes).toEqual([]);
  await detail
    .locator(".memory-editor-link-form")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await noteComposer.fill(NOTE_BODY);
  await detail.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(noteComposer).toBeHidden();
  await expect(detail.getByText(NOTE_BODY, { exact: true })).toBeVisible();
  await expect(detail.getByLabel("后续补充", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "追加笔记", exact: true })).toHaveCount(0);
  await expect(detail.getByText("1 条", { exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "收起详情", exact: true })).toBeEnabled();
  await expect(detail.getByRole("button", { name: "关闭详情", exact: true })).toBeEnabled();
  await detail.getByRole("button", { name: "编辑第 1 条追加笔记", exact: true }).click();
  await expect(detail.getByRole("button", { name: "收起详情", exact: true })).toBeDisabled();
  await expect(detail.getByRole("button", { name: "关闭详情", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "取消", exact: true }).click();
  await expect(detail.getByRole("button", { name: "收起详情", exact: true })).toBeEnabled();
  await expect(page.locator("canvas")).toHaveCount(1);
  await detail.getByRole("button", { name: "收起详情", exact: true }).click();
  await expect(page.locator(".memory-star-detail-transition-layer")).toHaveCount(0);
  const collapsedPreview = page.getByRole("dialog", { name: RECORD_TITLE });
  await expect(collapsedPreview).toHaveAttribute("data-detail-presentation", "compact");
  await collapsedPreview.getByRole("button", { name: "展开详情", exact: true }).click();
  await page
    .getByRole("dialog", { name: RECORD_TITLE })
    .getByRole("button", { name: "关闭详情", exact: true })
    .click();

  await page.getByText("星星列表", { exact: true }).click();
  const starButton = page.getByRole("button", { name: new RegExp(RECORD_TITLE) });
  await expect(starButton).toContainText("追加 1");
  const storedAfterAppend = await readFragmentGardenPersistence(page);
  expect(storedAfterAppend.fragments).toHaveLength(1);
  expect(storedAfterAppend.fragmentNotes).toHaveLength(1);

  const backupDialog = await openBackupFromSettings(page);
  await expect(backupDialog).toHaveAttribute("data-appearance", "starmap");
  await expect(backupDialog.getByRole("button", { name: "导出备份", exact: true })).toBeVisible();
  await backupDialog.getByRole("button", { name: "关闭", exact: true }).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await expect(settingsDialog.getByRole("button", { name: /^数据备份/u })).toBeFocused();
  await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByText("星星列表", { exact: true }).click();
  await page.getByRole("button", { name: new RegExp(RECORD_TITLE) }).click();

  const refreshedPreview = page.getByRole("dialog", { name: RECORD_TITLE });
  await refreshedPreview.getByRole("button", { name: "展开详情", exact: true }).click();
  const refreshedDetail = page.getByRole("dialog", { name: RECORD_TITLE });
  await expect(refreshedDetail.getByText(NOTE_BODY, { exact: true })).toBeVisible();
  await refreshedDetail.getByRole("button", { name: "删除记录", exact: true }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "删除这条记录？" });
  await expect(deleteDialog).toHaveAttribute("data-appearance", "starmap");
  await deleteDialog.getByRole("button", { name: "删除记录", exact: true }).click();

  await expect(deleteDialog).toBeHidden();
  await expect(page.getByText("星空正在等待第一条记录", { exact: true })).toBeVisible();
  await expect(page.getByText("0 颗记忆星", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test("morphs a successful text save into a star before closing the record dialog", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required.");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.goto("/garden");
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();
  await installTextSaveTransitionObserver(page);

  await page.getByRole("button", { name: "记录内容", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "记录此刻" });
  await createDialog
    .getByLabel("内容", { exact: true })
    .fill("一颗正在形成的星\n保存之后，让按钮变成星星。");
  await createDialog.getByRole("button", { name: "保存记录", exact: true }).click();

  await expect(createDialog).toBeHidden({ timeout: 10_000 });
  const transitionObservation = await readTextSaveTransitionObservation(page);
  expect(transitionObservation.phases).toEqual(["expand", "star", "complete"]);
  expect(transitionObservation.launchingDialogStyle).toEqual({
    backgroundImage: "none",
    borderColor: "rgba(0, 0, 0, 0)",
    boxShadow: "none",
  });
  const target = transitionObservation.target;
  if (target === null) throw new Error("Record save transition has no star target.");
  expect(Number.isFinite(target.clientX)).toBe(true);
  expect(Number.isFinite(target.clientY)).toBe(true);
  const morphBounds = transitionObservation.starBounds;
  if (morphBounds === null) throw new Error("Record save morph has no visible bounds.");
  expect(morphBounds.width).toBeLessThanOrEqual(140);
  expect(morphBounds.height).toBeLessThanOrEqual(140);
  expect(Math.abs(morphBounds.width - morphBounds.height)).toBeLessThanOrEqual(2);
  await expect(page.getByText("1 颗记忆星", { exact: true })).toBeVisible();

  const stored = await readFragmentGardenPersistence(page);
  expect(stored.fragments).toHaveLength(1);
  const created = stored.fragments[0];
  if (created === undefined) throw new Error("Created fragment was not persisted.");
  await page.mouse.click(target.clientX, target.clientY);
  const preview = page.getByRole("dialog", { name: created.title });
  await expect(preview).toHaveAttribute("data-detail-presentation", "compact");
  await expect(preview.getByRole("button", { name: "展开详情", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("shows a single-line memory once and closes or switches its compact preview", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required.");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.goto("/garden");
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();

  async function createTextStar(content: string): Promise<ClientPoint> {
    await page.getByRole("button", { name: "记录内容", exact: true }).click();
    const createDialog = page.getByRole("dialog", { name: "记录此刻" });
    await createDialog.getByLabel("内容", { exact: true }).fill(content);
    await createDialog.getByRole("button", { name: "保存记录", exact: true }).click();
    const transition = page.getByTestId("record-save-morph");
    const target = await readTransitionTarget(transition);
    await expect(transition).toHaveCount(0);
    return target;
  }

  const firstStar = await createTextStar("666");
  await page.mouse.click(firstStar.clientX, firstStar.clientY);
  const firstPreview = page.getByRole("dialog", { name: "666" });
  await expect(firstPreview).toHaveAttribute("data-detail-presentation", "compact");
  await expect(firstPreview.locator("h2")).toHaveClass(/sr-only/);
  await expect(firstPreview.locator(".memory-star-detail-preview-excerpt")).toHaveText("666");

  const secondStar = await createTextStar("第二颗星");
  const starListSummary = page.getByText("星星列表", { exact: true });
  await starListSummary.click();
  await page.getByRole("button", { name: /^666 初次点亮$/u }).click();
  await expect(page.getByRole("dialog", { name: "666" })).toBeVisible();
  await starListSummary.press("Enter");
  await page.locator("canvas").dispatchEvent("click", secondStar);
  await expect(page.getByRole("dialog", { name: "666" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "第二颗星" })).toHaveAttribute(
    "data-detail-presentation",
    "compact",
  );

  const canvasBounds = await page.locator("canvas").boundingBox();
  if (canvasBounds === null) throw new Error("Memory starmap canvas has no visible bounds.");
  const blankCandidates: ClientPoint[] = [
    { clientX: canvasBounds.x + 24, clientY: canvasBounds.y + 24 },
    { clientX: canvasBounds.x + canvasBounds.width - 24, clientY: canvasBounds.y + 24 },
    { clientX: canvasBounds.x + 24, clientY: canvasBounds.y + canvasBounds.height - 24 },
  ];
  const blankPoint =
    blankCandidates.find((candidate) =>
      [firstStar, secondStar].every(
        (star) =>
          Math.hypot(candidate.clientX - star.clientX, candidate.clientY - star.clientY) > 80,
      ),
    ) ?? blankCandidates[0];
  if (blankPoint === undefined) throw new Error("No blank canvas point is available.");
  await page.mouse.click(blankPoint.clientX, blankPoint.clientY);
  await expect(page.getByRole("dialog", { name: "第二颗星" })).toHaveCount(0);

  await starListSummary.press("Enter");
  await page.getByRole("button", { name: /^666 初次点亮$/u }).click();
  await expect(page.getByRole("dialog", { name: "666" })).toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "666" })).toHaveCount(0);
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await settingsDialog.getByRole("button", { name: /^数据备份/u }).click();
  await page
    .getByRole("dialog", { name: "数据与备份" })
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await settingsDialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("hands detail surfaces across fullscreen transitions without a blank frame", async ({
  context,
  page,
}) => {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required.");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await clearFragmentGardenIndexedDb(context, page, baseURL);
  await page.goto("/garden");
  await expect(page.locator('[data-runtime-state="ready"]')).toBeVisible();

  await page.getByRole("navigation").getByRole("button").first().click();
  const createDialog = page.locator("dialog.memory-record-dialog");
  await createDialog.locator("textarea").fill("Transition continuity regression");
  await createDialog.locator('button[type="submit"]').click();

  const saveTransition = page.getByTestId("record-save-morph");
  await expect(saveTransition).toBeVisible();
  const starPosition = await readTransitionTarget(saveTransition);
  await expect(saveTransition).toHaveCount(0);
  await page.mouse.click(starPosition.clientX, starPosition.clientY);

  const compactPreview = page.locator('[data-detail-presentation="compact"]');
  await expect(compactPreview).toBeVisible();
  await installDetailHandoffObserver(page);
  await compactPreview.locator(".memory-star-detail-icon-button").click();
  await expect(page.locator(".memory-star-detail-transition-layer")).toHaveCount(0);

  const expandedDialog = page.locator("dialog.memory-star-detail-dialog");
  await expect(expandedDialog).toBeVisible();
  const expandSamples = await readDetailHandoffObservation(page);
  expect(expandSamples.some((sample) => sample.hasTransition)).toBe(true);
  const expandedHandoff = expandSamples.find(
    (sample) => !sample.hasTransition && sample.hasExpanded,
  );
  expect(expandedHandoff).toMatchObject({
    expandedContentOpacity: 1,
    isExpandedOpen: true,
  });

  await installDetailHandoffObserver(page);
  await expandedDialog
    .locator(".memory-star-detail-dialog-actions .memory-star-detail-icon-button")
    .nth(1)
    .click();
  await expect(page.locator(".memory-star-detail-transition-layer")).toHaveCount(0);
  await expect(compactPreview).toBeVisible();

  const collapseSamples = await readDetailHandoffObservation(page);
  expect(collapseSamples.some((sample) => sample.hasTransition)).toBe(true);
  const compactHandoff = collapseSamples.find(
    (sample) => !sample.hasTransition && sample.hasCompact,
  );
  expect(compactHandoff?.compactOpacity).toBe(1);
  await expect(page.locator("canvas")).toHaveCount(1);
});
