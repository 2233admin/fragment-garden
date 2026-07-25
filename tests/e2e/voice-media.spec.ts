import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { completeCompanionOnboardingIfNeeded } from "./helpers/companion";
import { clearFragmentGardenIndexedDb, readFragmentGardenPersistence } from "./helpers/indexed-db";

const TRANSCRIPT = "今天记录一个可以慢慢整理的想法。";

declare global {
  interface Window {
    __voiceRecorderTestState?: {
      getUserMediaCalls: number;
      stoppedTracks: number;
    };
  }
}

function baseUrl(): string {
  const value = test.info().project.use.baseURL;
  if (typeof value !== "string") throw new Error("Missing Playwright baseURL");
  return value;
}

async function installRecorderStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeTrack {
      stopped = false;

      stop(): void {
        this.stopped = true;
      }
    }

    class FakeStream {
      private readonly tracks = [new FakeTrack()];

      getTracks(): FakeTrack[] {
        return this.tracks;
      }
    }

    class FakeMediaRecorder {
      static isTypeSupported(type: string): boolean {
        return type === "audio/webm;codecs=opus";
      }

      readonly mimeType = "audio/webm;codecs=opus";
      state: "inactive" | "recording" = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      constructor() {}

      start(): void {
        this.state = "recording";
      }

      stop(): void {
        if (this.state === "inactive") return;
        this.ondataavailable?.({
          data: new Blob(["controlled voice recording"], { type: this.mimeType }),
        });
        this.state = "inactive";
        this.onstop?.();
      }
    }

    const state = { getUserMediaCalls: 0, stoppedTracks: 0 };
    Object.defineProperty(window, "__voiceRecorderTestState", {
      configurable: true,
      value: state,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          state.getUserMediaCalls += 1;
          const stream = new FakeStream();
          const originalGetTracks = stream.getTracks.bind(stream);
          stream.getTracks = () =>
            originalGetTracks().map((track) => {
              const originalStop = track.stop.bind(track);
              track.stop = () => {
                if (!track.stopped) state.stoppedTracks += 1;
                originalStop();
              };
              return track;
            });
          return stream;
        },
      },
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });
}

async function initializeGarden(context: BrowserContext, page: Page): Promise<void> {
  await clearFragmentGardenIndexedDb(context, page, baseUrl());
  await installRecorderStub(page);
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
}

test("creates a local voice fragment before disclosure and restores its transcript", async ({
  context,
  page,
}) => {
  await initializeGarden(context, page);

  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "语音", exact: true }).click();
  const voiceDialog = page.getByRole("dialog", { name: "种下语音碎片" });
  await expect(
    voiceDialog.getByText("点击开始后才会申请麦克风权限。", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__voiceRecorderTestState?.getUserMediaCalls))
    .toBe(0);

  await voiceDialog.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(voiceDialog.getByText("正在录音", { exact: false })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__voiceRecorderTestState?.getUserMediaCalls))
    .toBe(1);
  await page.waitForTimeout(300);
  await voiceDialog.getByRole("button", { name: "停止录音", exact: true }).click();
  await expect(voiceDialog.getByText("录音已经准备好", { exact: true })).toBeVisible();
  await voiceDialog.getByLabel("标题（可选）").fill("一段语音想法");
  await voiceDialog.getByRole("button", { name: "种下语音", exact: true }).click();

  await expect(voiceDialog).toBeHidden();
  await expect(page.getByText("语音已经先种下了。", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets.length)
    .toBe(1);
  let persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(1);
  expect(persistence.fragments[0]?.contentType).toBe("audio");
  expect(persistence.mediaAssets[0]).toMatchObject({
    kind: "audio",
    mimeType: "audio/webm",
    processingStatus: "pending",
  });
  expect(persistence.mediaAssets[0]?.blobSize).toBeGreaterThan(0);

  const disclosure = page.getByRole("dialog", { name: "发送当前录音前，请先确认" });
  await expect(disclosure).toBeVisible();

  let requestCount = 0;
  await page.route("**/api/media/audio/transcribe", async (route) => {
    requestCount += 1;
    const clientRequestId = route.request().headers()["x-client-request-id"] ?? "voice-e2e-request";
    await route.fulfill({
      body: JSON.stringify({
        requestId: "00000000-0000-4000-8000-000000000002",
        clientRequestId,
        transcription: { transcript: TRANSCRIPT },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await disclosure.getByRole("button", { name: "同意并转写", exact: true }).click();

  await expect.poll(() => requestCount).toBe(1);
  await expect
    .poll(async () => (await readFragmentGardenPersistence(page)).mediaAssets[0]?.processingStatus)
    .toBe("completed");
  expect(await page.evaluate(() => window.__voiceRecorderTestState?.stoppedTracks)).toBe(1);

  await page.getByRole("button", { name: "打开碎片：一段语音想法" }).click();
  const detail = page.getByRole("dialog", { name: "一段语音想法" });
  await expect(detail.getByRole("heading", { name: "语音", exact: true })).toBeVisible();
  await expect(detail.getByLabel("用户上传的语音：一段语音想法")).toBeVisible();
  await expect(detail.getByText(TRANSCRIPT, { exact: true })).toBeVisible();
  await expect(detail.getByLabel("编辑转写文字")).toHaveValue(TRANSCRIPT);

  await detail.getByLabel("编辑转写文字").fill("用户修改后的转写");
  await detail.getByRole("button", { name: "保存转写修改", exact: true }).click();
  await expect(detail.getByLabel("编辑转写文字")).toHaveValue("用户修改后的转写");

  await detail.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await page.getByRole("button", { name: "打开碎片：一段语音想法" }).click();
  const refreshedDetail = page.getByRole("dialog", { name: "一段语音想法" });
  await expect(refreshedDetail.getByLabel("编辑转写文字")).toHaveValue("用户修改后的转写");
  persistence = await readFragmentGardenPersistence(page);
  expect(persistence.mediaAssets[0]?.transcript).toBe("用户修改后的转写");
  expect(requestCount).toBe(1);
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(1);
});

test("permission denial does not create a voice fragment", async ({ context, page }) => {
  await clearFragmentGardenIndexedDb(context, page, baseUrl());
  await page.addInitScript(() => {
    class UnsupportedRecorder {
      static isTypeSupported(): boolean {
        return true;
      }
    }
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: UnsupportedRecorder,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException("permission denied", "NotAllowedError");
        },
      },
    });
  });
  await page.goto("/garden");
  await completeCompanionOnboardingIfNeeded(page);
  await page.getByRole("button", { name: "卡片模式", exact: true }).click();
  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "语音", exact: true }).click();
  const voiceDialog = page.getByRole("dialog", { name: "种下语音碎片" });
  await voiceDialog.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(voiceDialog.getByRole("alert")).toContainText("没有获得麦克风权限");
  const persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(0);
  expect(persistence.mediaAssets).toHaveLength(0);
});

test("closing a recording dialog stops the microphone without creating media", async ({
  context,
  page,
}) => {
  await initializeGarden(context, page);

  await page.getByRole("button", { name: "种下碎片", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "种下文字碎片" });
  await createDialog.getByRole("button", { name: "语音", exact: true }).click();
  const voiceDialog = page.getByRole("dialog", { name: "种下语音碎片" });

  await voiceDialog.getByRole("button", { name: "开始录音", exact: true }).click();
  await expect(voiceDialog.getByText("正在录音", { exact: false })).toBeVisible();
  await voiceDialog.press("Escape");
  await expect(voiceDialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.__voiceRecorderTestState?.stoppedTracks))
    .toBe(1);

  const persistence = await readFragmentGardenPersistence(page);
  expect(persistence.fragments).toHaveLength(0);
  expect(persistence.mediaAssets).toHaveLength(0);
});
