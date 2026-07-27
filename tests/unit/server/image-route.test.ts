import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";

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
      readonly responses = { create: openAiSdkMock.create };

      constructor(options: unknown) {
        openAiSdkMock.constructorOptions.push(options);
      }
    },
  };
});

import { POST } from "../../../app/api/media/image/analyze/route";
import {
  IMAGE_ANALYSIS_MAX_OUTPUT_TOKENS,
  IMAGE_ANALYSIS_RESPONSE_FORMAT,
} from "../../../lib/server/openai/image/image-schema";
import { IMAGE_ROUTE_REQUEST_MAX_BYTES } from "../../../lib/server/openai/image/image-errors";
import { OPENAI_IMAGE_ANALYSIS_TIMEOUT_MS } from "../../../lib/server/openai/image/image-client";

const TEST_KEY = "route-image-test-key";
const TEST_MODEL = "route-image-test-model";

function createPngFile(size = 24, type = "image/png"): File {
  const bytes = new Uint8Array(Math.max(size, 24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, 2);
  new DataView(bytes.buffer).setUint32(20, 2);
  return new File([bytes], "garden.png", { type });
}

function createRequest(
  file: Blob,
  options: { clientRequestId?: string; extraFields?: Record<string, string> } = {},
): Request {
  const formData = new FormData();
  formData.append("file", file, "garden.png");
  formData.append("clientRequestId", options.clientRequestId ?? "image-request-1");
  for (const [key, value] of Object.entries(options.extraFields ?? {})) {
    formData.append(key, value);
  }

  return new Request("http://localhost/api/media/image/analyze", {
    method: "POST",
    body: formData,
  });
}

function createProviderResponse(result: unknown): OpenAIResponse {
  return {
    status: "completed",
    output: [],
    output_text: JSON.stringify(result),
  } as unknown as OpenAIResponse;
}

const VALID_RESULT = {
  title: "一张小花园笔记",
  markdown: "## 画面内容\n\n这是一张带有 **Start here** 界面文案的简洁截图。",
} as const;

describe("image analysis Route Handler", () => {
  beforeEach(() => {
    process.env.OPENAI_IMAGE_ANALYSIS_ENABLED = "true";
    process.env.OPENAI_API_KEY = TEST_KEY;
    process.env.OPENAI_IMAGE_MODEL = TEST_MODEL;
    openAiSdkMock.create.mockReset();
    openAiSdkMock.constructorOptions.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.OPENAI_IMAGE_ANALYSIS_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_IMAGE_MODEL;
    vi.restoreAllMocks();
  });

  it("accepts one image and sends a bounded non-stored strict Responses request", async () => {
    openAiSdkMock.create.mockResolvedValue(createProviderResponse(VALID_RESULT));
    const routeRequest = createRequest(createPngFile());

    const response = await POST(routeRequest);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(bodyText)).toMatchObject({
      clientRequestId: "image-request-1",
      analysis: VALID_RESULT,
    });
    expect(JSON.parse(bodyText).requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(openAiSdkMock.constructorOptions).toEqual([
      {
        apiKey: TEST_KEY,
        logLevel: "off",
        maxRetries: 0,
        timeout: OPENAI_IMAGE_ANALYSIS_TIMEOUT_MS,
      },
    ]);

    const request = openAiSdkMock.create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: TEST_MODEL,
      store: false,
      max_output_tokens: IMAGE_ANALYSIS_MAX_OUTPUT_TOKENS,
      text: { format: { type: "json_schema", strict: true, name: "image_analysis" } },
    });
    expect(request?.text?.format).toEqual(IMAGE_ANALYSIS_RESPONSE_FORMAT);
    expect(IMAGE_ANALYSIS_RESPONSE_FORMAT.schema).toMatchObject({
      required: ["title", "markdown"],
      additionalProperties: false,
      properties: {
        title: {
          description: expect.stringContaining("Simplified Chinese"),
          maxLength: 100,
        },
        markdown: {
          description: expect.stringContaining("Simplified Chinese"),
          maxLength: 8_000,
        },
      },
    });
    expect(request?.instructions).toContain("untrusted content");
    expect(request?.instructions).toMatch(/Do\s+not emit raw HTML/u);
    expect(request?.instructions).toContain("Simplified Chinese (zh-CN)");
    expect(request?.instructions).toContain("even when the image contains English");
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("reasoning");
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("conversation");
    const imageInput = request?.input?.[0]?.content?.[1];
    const textInput = request?.input?.[0]?.content?.[0];
    expect(textInput).toMatchObject({ type: "input_text" });
    expect((textInput as { text?: string }).text).toContain("Simplified Chinese Markdown note");
    expect(imageInput).toMatchObject({ type: "input_image", detail: "auto" });
    expect((imageInput as { image_url?: string }).image_url).toMatch(/^data:image\/png;base64,/u);
    expect(openAiSdkMock.create.mock.calls[0]?.[1]).toEqual({ signal: routeRequest.signal });
    expect(bodyText).not.toContain(TEST_KEY);
    expect(bodyText).not.toContain(TEST_MODEL);
  });

  it.each([
    ["non-multipart", new Request("http://localhost", { method: "POST", body: "{}" })],
    ["client model", createRequest(createPngFile(), { extraFields: { model: "client-model" } })],
    ["client prompt", createRequest(createPngFile(), { extraFields: { prompt: "client-prompt" } })],
  ])("rejects %s before OpenAI", async (_label, request) => {
    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("rejects a multipart body above the hard cap", async () => {
    const response = await POST(
      new Request("http://localhost/api/media/image/analyze", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=vitest-boundary" },
        body: new Uint8Array(IMAGE_ROUTE_REQUEST_MAX_BYTES + 1),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "file_too_large" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it.each([
    ["unsupported MIME", createPngFile(24, "image/gif"), "unsupported_media_type"],
    [
      "invalid signature",
      new File([new Uint8Array(24)], "fake.png", { type: "image/png" }),
      "invalid_image",
    ],
    ["empty file", new File([], "empty.png", { type: "image/png" }), "invalid_image"],
  ] as const)("rejects %s without provider access", async (_label, file, code) => {
    const response = await POST(createRequest(file));

    expect(response.status).toBe(code === "unsupported_media_type" ? 415 : 400);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("requires the independent feature flag and image model configuration", async () => {
    process.env.OPENAI_IMAGE_ANALYSIS_ENABLED = "false";
    const disabled = await POST(createRequest(createPngFile()));
    process.env.OPENAI_IMAGE_ANALYSIS_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    const missingKey = await POST(createRequest(createPngFile()));
    process.env.OPENAI_API_KEY = TEST_KEY;
    delete process.env.OPENAI_IMAGE_MODEL;
    const missingModel = await POST(createRequest(createPngFile()));

    expect(disabled.status).toBe(503);
    expect(missingKey.status).toBe(503);
    expect(missingModel.status).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({
      error: { code: "image_analysis_disabled" },
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
  ] as const)("normalizes %s without provider details", async (_label, error, code, status) => {
    openAiSdkMock.create.mockRejectedValue(error);

    const response = await POST(createRequest(createPngFile()));
    const bodyText = await response.text();

    expect(response.status).toBe(status);
    expect(JSON.parse(bodyText)).toMatchObject({ error: { code } });
    expect(bodyText).not.toContain(TEST_KEY);
    expect(bodyText).not.toContain("private provider detail");
  });

  it.each([
    [
      "incomplete",
      { status: "incomplete", output: [], output_text: "private partial output" },
      "response_incomplete",
    ],
    [
      "invalid JSON",
      { status: "completed", output: [], output_text: "{not-json" },
      "invalid_model_response",
    ],
    [
      "refusal",
      {
        status: "completed",
        output: [
          {
            type: "message",
            id: "message-1",
            role: "assistant",
            status: "completed",
            content: [{ type: "refusal", refusal: "private refusal" }],
          },
        ],
      },
      "invalid_model_response",
    ],
    [
      "malformed message content",
      {
        status: "completed",
        output: [{ type: "message", content: null }],
      },
      "invalid_model_response",
    ],
    [
      "malformed output item",
      {
        status: "completed",
        output: [null],
      },
      "invalid_model_response",
    ],
  ] as const)("normalizes %s responses", async (_label, providerResponse, code) => {
    openAiSdkMock.create.mockResolvedValue(providerResponse as unknown as OpenAIResponse);

    const response = await POST(createRequest(createPngFile()));
    const bodyText = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(bodyText)).toMatchObject({ error: { code } });
    expect(bodyText).not.toContain("private");
    expect(bodyText).not.toContain("reasoning");
  });

  it.each([
    ["legacy extraction fields", { ...VALID_RESULT, summary: "legacy" }],
    ["empty Markdown", { title: VALID_RESULT.title, markdown: "   " }],
    ["oversized Markdown", { title: VALID_RESULT.title, markdown: "x".repeat(8_001) }],
  ])("rejects %s as an invalid structured result", async (_label, result) => {
    openAiSdkMock.create.mockResolvedValue(createProviderResponse(result));

    const response = await POST(createRequest(createPngFile()));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_model_response" },
    });
  });
});
