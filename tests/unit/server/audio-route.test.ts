import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transcription } from "openai/resources/audio/transcriptions";

const openAiSdkMock = vi.hoisted(() => ({
  create: vi.fn(),
  constructorOptions: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  return {
    ...actual,
    default: class OpenAIMock {
      readonly audio = { transcriptions: { create: openAiSdkMock.create } };

      constructor(options: unknown) {
        openAiSdkMock.constructorOptions.push(options);
      }
    },
  };
});

import { POST } from "../../../app/api/media/audio/transcribe/route";
import { AUDIO_ROUTE_REQUEST_MAX_BYTES } from "../../../lib/server/openai/audio/audio-errors";
import { AUDIO_TRANSCRIPTION_TIMEOUT_MS } from "../../../lib/server/openai/audio/audio-schema";

const TEST_KEY = "route-audio-test-key";
const TEST_MODEL = "route-audio-test-model";
const VALID_TRANSCRIPT = "这是一次本地语音转写。";

function createAudioFile(size = 32, type = "audio/webm"): File {
  return new File([new Uint8Array(Math.max(size, 1))], "recording.webm", { type });
}

function createRequest(
  file: Blob,
  options: {
    clientRequestId?: string;
    language?: string;
    extraFields?: Record<string, string>;
  } = {},
): Request {
  const formData = new FormData();
  formData.append("file", file, "recording.webm");
  formData.append("clientRequestId", options.clientRequestId ?? "audio-request-1");
  if (options.language !== undefined) formData.append("language", options.language);
  for (const [key, value] of Object.entries(options.extraFields ?? {})) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/media/audio/transcribe", {
    method: "POST",
    body: formData,
  });
}

function createProviderResponse(text: unknown): Transcription {
  return { text } as unknown as Transcription;
}

describe("audio transcription Route Handler", () => {
  beforeEach(() => {
    process.env.OPENAI_TRANSCRIPTION_ENABLED = "true";
    process.env.OPENAI_API_KEY = TEST_KEY;
    process.env.OPENAI_TRANSCRIPTION_MODEL = TEST_MODEL;
    openAiSdkMock.create.mockReset();
    openAiSdkMock.constructorOptions.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.OPENAI_TRANSCRIPTION_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_TRANSCRIPTION_MODEL;
    vi.restoreAllMocks();
  });

  it("accepts audio and sends a bounded non-streaming transcription request", async () => {
    openAiSdkMock.create.mockResolvedValue(createProviderResponse(VALID_TRANSCRIPT));
    const routeRequest = createRequest(createAudioFile(), { language: "ZH" });

    const response = await POST(routeRequest);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(bodyText)).toMatchObject({
      clientRequestId: "audio-request-1",
      transcription: { transcript: VALID_TRANSCRIPT },
    });
    expect(JSON.parse(bodyText).requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(openAiSdkMock.constructorOptions).toEqual([
      {
        apiKey: TEST_KEY,
        logLevel: "off",
        maxRetries: 0,
        timeout: AUDIO_TRANSCRIPTION_TIMEOUT_MS,
      },
    ]);

    const request = openAiSdkMock.create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: TEST_MODEL,
      response_format: "json",
      language: "zh",
    });
    expect(request).not.toHaveProperty("prompt");
    expect(request).not.toHaveProperty("stream");
    expect(request).not.toHaveProperty("timestamp_granularities");
    expect(request).not.toHaveProperty("include");
    expect(request?.file).toMatchObject({ type: "audio/webm", name: "recording.webm" });
    expect(openAiSdkMock.create.mock.calls[0]?.[1]).toEqual({ signal: routeRequest.signal });
    expect(bodyText).not.toContain(TEST_KEY);
    expect(bodyText).not.toContain(TEST_MODEL);
  });

  it.each([
    "audio/webm",
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
  ])("accepts supported MIME %s", async (type) => {
    openAiSdkMock.create.mockResolvedValue(createProviderResponse(VALID_TRANSCRIPT));
    const response = await POST(createRequest(createAudioFile(32, type)));
    expect(response.status).toBe(200);
    expect(openAiSdkMock.create).toHaveBeenCalledOnce();
    openAiSdkMock.create.mockReset();
  });

  it.each([
    ["non-multipart", new Request("http://localhost", { method: "POST", body: "{}" })],
    ["unknown model field", createRequest(createAudioFile(), { extraFields: { model: "bad" } })],
    ["unknown prompt field", createRequest(createAudioFile(), { extraFields: { prompt: "bad" } })],
  ])("rejects %s before OpenAI", async (_label, request) => {
    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("rejects a multipart body above the hard cap", async () => {
    const oversized = new File(
      [new Uint8Array(AUDIO_ROUTE_REQUEST_MAX_BYTES + 1)],
      "oversized.webm",
      { type: "audio/webm" },
    );
    const response = await POST(createRequest(oversized));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "file_too_large" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it.each([
    ["unsupported MIME", createAudioFile(32, "audio/flac"), "unsupported_media_type", 415],
    ["empty file", new File([], "empty.webm", { type: "audio/webm" }), "empty_recording", 400],
  ] as const)("rejects %s without provider access", async (_label, file, code, status) => {
    const response = await POST(createRequest(file));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("requires the independent feature flag and transcription model configuration", async () => {
    process.env.OPENAI_TRANSCRIPTION_ENABLED = "false";
    const disabled = await POST(createRequest(createAudioFile()));
    process.env.OPENAI_TRANSCRIPTION_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    const missingKey = await POST(createRequest(createAudioFile()));
    process.env.OPENAI_API_KEY = TEST_KEY;
    delete process.env.OPENAI_TRANSCRIPTION_MODEL;
    const missingModel = await POST(createRequest(createAudioFile()));

    expect(disabled.status).toBe(503);
    expect(missingKey.status).toBe(503);
    expect(missingModel.status).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({
      error: { code: "transcription_disabled" },
    });
    await expect(missingKey.json()).resolves.toMatchObject({
      error: { code: "missing_configuration" },
    });
    await expect(missingModel.json()).resolves.toMatchObject({
      error: { code: "missing_configuration" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "authentication",
      { status: 401, message: "private provider detail" },
      "authentication_failed",
      502,
    ],
    ["rate limit", { status: 429, message: "private provider detail" }, "rate_limited", 429],
    [
      "model unavailable",
      { status: 404, message: "private provider detail" },
      "model_unavailable",
      503,
    ],
    ["provider", { status: 500, message: "private provider detail" }, "provider_error", 502],
    [
      "timeout",
      { name: "TimeoutError", message: "private timeout detail" },
      "request_timeout",
      504,
    ],
  ] as const)("normalizes %s without provider details", async (_label, error, code, status) => {
    openAiSdkMock.create.mockRejectedValue(error);
    const response = await POST(createRequest(createAudioFile()));
    const bodyText = await response.text();
    expect(response.status).toBe(status);
    expect(JSON.parse(bodyText)).toMatchObject({ error: { code } });
    expect(bodyText).not.toContain(TEST_KEY);
    expect(bodyText).not.toContain("private provider detail");
    expect(bodyText).not.toContain("private timeout detail");
  });

  it.each([
    ["empty transcript", "", "invalid_transcription"],
    ["non-string transcript", 123, "invalid_transcription"],
    ["control characters only", "\u0000\u0001", "invalid_transcription"],
  ] as const)("normalizes %s", async (_label, transcript, code) => {
    openAiSdkMock.create.mockResolvedValue(createProviderResponse(transcript));
    const response = await POST(createRequest(createAudioFile()));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });
});
