import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

const VOICE_TITLE = "留在花园里的语音想法";
const ORIGINAL_TRANSCRIPT = "今天记录一个可以慢慢整理的想法。";
const EDITED_TRANSCRIPT = "今天先整理这个想法最重要的第一步。";

type CapturedSproutRequest = {
  source: {
    contentMarkdown: string;
    notes: Array<{ contentMarkdown: string; createdAt: string }>;
    sourceName: string | null;
    sourceType: "voice";
    title: string;
  };
};

function baseUrl(): string {
  const value = test.info().project.use.baseURL;
  if (typeof value !== "string") throw new Error("Missing Playwright baseURL");
  return value;
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, baseUrl());
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await expect(page.getByRole("button", { name: "卡片模式", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function seedHistoricalVoiceFragment(page: Page): Promise<void> {
  await page.evaluate(
    async ({ originalTranscript, title }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const transaction = database.transaction(
        ["settings", "fragments", "plants", "mediaAssets"],
        "readwrite",
      );
      const completion = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const timestamp = "2026-07-25T08:00:00.000Z";
      const fragmentId = "44444444-4444-4444-8444-444444444444";

      const sampleRate = 8_000;
      const sampleCount = 2_000;
      const bytesPerSample = 2;
      const dataLength = sampleCount * bytesPerSample;
      const waveBuffer = new ArrayBuffer(44 + dataLength);
      const view = new DataView(waveBuffer);
      const writeAscii = (offset: number, value: string): void => {
        for (let index = 0; index < value.length; index += 1) {
          view.setUint8(offset + index, value.charCodeAt(index));
        }
      };
      writeAscii(0, "RIFF");
      view.setUint32(4, 36 + dataLength, true);
      writeAscii(8, "WAVE");
      writeAscii(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * bytesPerSample, true);
      view.setUint16(32, bytesPerSample, true);
      view.setUint16(34, 16, true);
      writeAscii(36, "data");
      view.setUint32(40, dataLength, true);
      const blob = new Blob([waveBuffer], { type: "audio/wav" });

      const settingsStore = transaction.objectStore("settings");
      const settings = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = settingsStore.get("local-user");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (request.result === undefined) {
            reject(new Error("Local settings were not initialized"));
            return;
          }
          resolve(request.result as Record<string, unknown>);
        };
      });
      settingsStore.put({
        ...settings,
        sproutAiDisclosureAcceptedAt: timestamp,
      });

      transaction.objectStore("fragments").put({
        id: fragmentId,
        contentType: "audio",
        title,
        rawText: null,
        sourceUrl: null,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "completed",
        embedding: null,
        parentFragmentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      });
      transaction.objectStore("plants").put({
        id: "plant-historical-voice",
        fragmentId,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId: "slot-01",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      transaction.objectStore("mediaAssets").put({
        id: "asset-historical-voice",
        fragmentId,
        kind: "audio",
        blob,
        mimeType: "audio/wav",
        fileName: "historical-voice.wav",
        sizeBytes: blob.size,
        width: null,
        height: null,
        durationMs: 250,
        processingStatus: "completed",
        processingRequestId: null,
        errorCode: null,
        temporaryTitle: null,
        generatedTitle: null,
        summary: null,
        visibleText: null,
        contentKind: null,
        transcript: originalTranscript,
        originalTranscript,
        transcriptEditedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await completion;
      database.close();
    },
    { originalTranscript: ORIGINAL_TRANSCRIPT, title: VOICE_TITLE },
  );
}

async function fulfillSproutNote(route: Route): Promise<void> {
  await route.fulfill({
    body: JSON.stringify({
      title: "语音里最重要的第一步",
      markdown: "## 下一步\n\n先把语音中最重要的第一步写清楚。",
    }),
    contentType: "application/json",
    status: 200,
  });
}

test("keeps the default create dialog limited to text, link, and image", async ({
  context,
  page,
}) => {
  let transcriptionRequests = 0;
  await page.route("**/api/media/audio/transcribe", async (route) => {
    transcriptionRequests += 1;
    await route.fulfill({ body: "{}", contentType: "application/json", status: 500 });
  });
  await initializeGarden(context, page);

  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await expect(createDialog).toBeVisible();

  const modeGroup = createDialog.getByRole("group", { name: "碎片类型" });
  const modeButtons = modeGroup.getByRole("button");
  await expect(modeButtons).toHaveCount(3);
  await expect(modeButtons).toHaveText(["文字", "链接", "图片"]);
  await expect(modeGroup.getByRole("button", { name: "语音", exact: true })).toHaveCount(0);
  await expect(createDialog.getByRole("button", { name: "开始录音", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "种下语音碎片" })).toHaveCount(0);

  const textButton = modeGroup.getByRole("button", { name: "文字", exact: true });
  const linkButton = modeGroup.getByRole("button", { name: "链接", exact: true });
  const imageButton = modeGroup.getByRole("button", { name: "图片", exact: true });
  await textButton.focus();
  await page.keyboard.press("Tab");
  await expect(linkButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(imageButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(createDialog.getByLabel("标题（可选）")).toBeFocused();

  await imageButton.click();
  const imageDialog = page.getByRole("dialog", { name: "种下图片碎片" });
  await expect(imageDialog.locator('input[type="file"]')).toBeVisible();
  await expect(imageDialog.getByRole("button", { name: "开始录音", exact: true })).toHaveCount(0);
  await imageDialog.getByRole("button", { name: "文字", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "种下文字碎片" }).getByLabel("内容")).toBeVisible();

  expect(transcriptionRequests).toBe(0);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
});

test("keeps historical voice playback and transcript editing without exposing retranscription", async ({
  context,
  page,
}) => {
  let transcriptionRequests = 0;
  let legacySproutRequests = 0;
  const sproutRequests: CapturedSproutRequest[] = [];
  let sproutRequestBody = "";
  await page.route("**/api/media/audio/transcribe", async (route) => {
    transcriptionRequests += 1;
    await route.fulfill({ body: "{}", contentType: "application/json", status: 500 });
  });
  await page.route("**/api/sprout/analyze", async (route) => {
    legacySproutRequests += 1;
    await route.fulfill({ body: "unexpected legacy request", status: 500 });
  });
  await page.route("**/api/sprout/generate", async (route) => {
    sproutRequestBody = route.request().postData() ?? "";
    sproutRequests.push(route.request().postDataJSON() as CapturedSproutRequest);
    await fulfillSproutNote(route);
  });

  await initializeGarden(context, page);
  await seedHistoricalVoiceFragment(page);
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();

  const cardButton = page.getByRole("button", { name: `打开笔记：${VOICE_TITLE}` });
  await expect(cardButton).toBeVisible();
  await expect(cardButton.getByText(/历史语音/u)).toBeVisible();
  await cardButton.click();

  const detail = page.getByRole("dialog", { name: VOICE_TITLE });
  const audio = detail.getByLabel(`用户录制的语音：${VOICE_TITLE}`);
  await expect(audio).toBeVisible();
  await expect(audio).toHaveAttribute("src", /^blob:/u);
  const localAudio = await audio.evaluate(async (element) => {
    const response = await fetch((element as HTMLAudioElement).src);
    const blob = await response.blob();
    return { size: blob.size, type: blob.type };
  });
  expect(localAudio).toEqual({ size: 4_044, type: "audio/wav" });

  await expect(detail.getByRole("button", { name: "重新转写", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "转写录音", exact: true })).toHaveCount(0);
  await expect(detail.getByText(ORIGINAL_TRANSCRIPT, { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "编辑转写", exact: true }).click();
  const transcriptInput = detail.getByLabel("编辑转写文字");
  await expect(transcriptInput).toHaveValue(ORIGINAL_TRANSCRIPT);

  await transcriptInput.fill(EDITED_TRANSCRIPT);
  await detail.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets[0]?.transcript)
    .toBe(EDITED_TRANSCRIPT);
  await expect(detail.getByText(EDITED_TRANSCRIPT, { exact: true })).toBeVisible();
  await expect(detail.getByText("查看最初转写", { exact: true })).toBeVisible();
  await expect(detail).not.toContainText(/转写完成|处理状态|成长分|成长阶段/u);

  await detail.getByRole("button", { name: "发芽", exact: true }).click();
  const sproutDialog = page.getByRole("dialog", { name: "生成一条新笔记" });
  await expect(sproutDialog.getByRole("heading", { name: "新笔记预览" })).toBeVisible();
  await expect(sproutDialog.locator('input[id^="sprout-title-"]')).toHaveValue(
    "语音里最重要的第一步",
  );

  expect(sproutRequests).toHaveLength(1);
  const sproutRequest = sproutRequests[0];
  expect(sproutRequest).toBeDefined();
  if (sproutRequest === undefined) {
    throw new Error("Expected the historical voice fragment to request thought sprouting");
  }
  expect(sproutRequest.source).toMatchObject({
    contentMarkdown: EDITED_TRANSCRIPT,
    notes: [],
    sourceName: "historical-voice.wav",
    sourceType: "voice",
    title: VOICE_TITLE,
  });
  expect(sproutRequest.source).not.toHaveProperty("blob");
  expect(sproutRequest.source).not.toHaveProperty("audio");
  expect(sproutRequestBody).not.toContain("audio/wav");
  expect(sproutRequestBody).not.toContain("RIFF");
  expect(sproutRequestBody).not.toContain(ORIGINAL_TRANSCRIPT);
  expect(legacySproutRequests).toBe(0);
  expect(transcriptionRequests).toBe(0);
  await sproutDialog.getByRole("button", { name: "放弃", exact: true }).click();
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
});
