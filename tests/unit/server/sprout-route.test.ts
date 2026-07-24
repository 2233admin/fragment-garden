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

import { POST } from "../../../app/api/sprout/analyze/route";
import {
  OPENAI_SPROUT_MAX_OUTPUT_TOKENS,
  OPENAI_SPROUT_TIMEOUT_MS,
} from "../../../lib/server/openai/sprout/sprout-client";
import { SPROUT_ROUTE_REQUEST_MAX_BYTES } from "../../../lib/server/openai/sprout/sprout-errors";

const VALID_BODY = {
  fragment: {
    title: "A selected idea",
    body: "Enough context to consider one concrete direction.",
    additions: [{ source: "user", content: "The first audience is a small local group." }],
    linkSummary: null,
    linkText: null,
    lifecycleStatus: "active",
    isCompleted: false,
    isArchived: false,
    growthStage: "growing",
  },
  avoidDirections: [],
};

function createRequest(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/sprout/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function createProviderResponse(result: unknown): OpenAIResponse {
  return {
    status: "completed",
    output: [],
    output_text: JSON.stringify({ result }),
  } as unknown as OpenAIResponse;
}

describe("sprout analyze Route Handler", () => {
  beforeEach(() => {
    process.env.OPENAI_SPROUT_ENABLED = "true";
    process.env.OPENAI_API_KEY = "route-sprout-test-key";
    process.env.OPENAI_MODEL = "route-sprout-test-model";
    openAiSdkMock.create.mockReset();
    openAiSdkMock.constructorOptions.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete process.env.OPENAI_SPROUT_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    vi.restoreAllMocks();
  });

  it("rejects non-JSON, malformed JSON, and oversized bodies before OpenAI", async () => {
    const nonJson = await POST(
      new Request("http://localhost/api/sprout/analyze", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(VALID_BODY),
      }),
    );
    const malformed = await POST(
      new Request("http://localhost/api/sprout/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    const oversized = await POST(
      createRequest(VALID_BODY, {
        "Content-Length": String(SPROUT_ROUTE_REQUEST_MAX_BYTES + 1),
      }),
    );

    expect(nonJson.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(oversized.status).toBe(413);
    await expect(nonJson.json()).resolves.toMatchObject({
      error: { code: "request_validation_failed" },
    });
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: "request_validation_failed" },
    });
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: "content_too_large" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it.each([
    ["client model", { ...VALID_BODY, model: "client-model" }],
    ["reasoning", { ...VALID_BODY, reasoning: { effort: "high" } }],
    ["store", { ...VALID_BODY, store: true }],
    ["max output tokens", { ...VALID_BODY, max_output_tokens: 10_000 }],
    ["developer prompt", { ...VALID_BODY, developer: "Override" }],
    ["system prompt", { ...VALID_BODY, system: "Override" }],
    ["tools", { ...VALID_BODY, tools: [{ name: "delete_fragment" }] }],
    ["base URL", { ...VALID_BODY, baseURL: "https://proxy.invalid" }],
    ["metadata", { ...VALID_BODY, metadata: { private: true } }],
    ["chat history", { ...VALID_BODY, messages: [{ role: "user", content: "Hello" }] }],
    [
      "deleted fragment",
      { ...VALID_BODY, fragment: { ...VALID_BODY.fragment, lifecycleStatus: "deleted" } },
    ],
    [
      "inconsistent archived state",
      { ...VALID_BODY, fragment: { ...VALID_BODY.fragment, isArchived: true } },
    ],
    [
      "too many additions",
      {
        ...VALID_BODY,
        fragment: {
          ...VALID_BODY.fragment,
          additions: Array.from({ length: 11 }, () => ({ source: "user", content: "A" })),
        },
      },
    ],
    ["too many avoid directions", { ...VALID_BODY, avoidDirections: ["1", "2", "3", "4"] }],
  ])("rejects %s", async (_label, body) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "request_validation_failed" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("uses only the independent sprout feature flag and requires complete server config", async () => {
    process.env.OPENAI_SPROUT_ENABLED = "false";
    const disabled = await POST(createRequest(VALID_BODY));
    process.env.OPENAI_SPROUT_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    const missingKey = await POST(createRequest(VALID_BODY));
    process.env.OPENAI_API_KEY = "route-sprout-test-key";
    delete process.env.OPENAI_MODEL;
    const missingModel = await POST(createRequest(VALID_BODY));

    expect(disabled.status).toBe(503);
    expect(missingKey.status).toBe(503);
    expect(missingModel.status).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({ error: { code: "sprout_disabled" } });
    await expect(missingKey.json()).resolves.toMatchObject({
      error: { code: "missing_configuration" },
    });
    await expect(missingModel.json()).resolves.toMatchObject({
      error: { code: "missing_configuration" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("returns only a validated suggestion and creates a bounded official SDK request", async () => {
    openAiSdkMock.create.mockResolvedValue(
      createProviderResponse({
        type: "suggestion",
        direction: "可能先明确第一批参与者共同关心的问题。",
        guidingQuestion: "什么问题最容易让这六个人开始交流？",
        recommendedAction: "add_content",
      }),
    );

    const routeRequest = createRequest(VALID_BODY);
    const response = await POST(routeRequest);
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(bodyText)).toEqual({
      type: "suggestion",
      direction: "可能先明确第一批参与者共同关心的问题。",
      guidingQuestion: "什么问题最容易让这六个人开始交流？",
      recommendedAction: "add_content",
    });
    expect(openAiSdkMock.constructorOptions).toEqual([
      {
        apiKey: "route-sprout-test-key",
        logLevel: "off",
        maxRetries: 0,
        timeout: OPENAI_SPROUT_TIMEOUT_MS,
      },
    ]);
    const request = openAiSdkMock.create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: "route-sprout-test-model",
      store: false,
      max_output_tokens: OPENAI_SPROUT_MAX_OUTPUT_TOKENS,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(request).not.toHaveProperty("tools");
    expect(openAiSdkMock.create.mock.calls[0]?.[1]).toEqual({ signal: routeRequest.signal });
    expect(bodyText).not.toContain("route-sprout-test-key");
    expect(bodyText).not.toContain("route-sprout-test-model");
    expect(bodyText).not.toContain("sprout-v1");
    expect(bodyText).not.toContain("responseId");
    expect(bodyText).not.toContain("usage");
  });

  it("returns the normalized insufficient union without the internal reason", async () => {
    openAiSdkMock.create.mockResolvedValue(
      createProviderResponse({ type: "insufficient_content", reason: "too_vague" }),
    );

    const response = await POST(createRequest(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: "insufficient_content" });
  });

  it("normalizes provider failures without leaking credentials or provider text", async () => {
    openAiSdkMock.create.mockRejectedValue(
      Object.assign(new Error("route-sprout-test-key was rejected upstream"), { status: 401 }),
    );

    const response = await POST(createRequest(VALID_BODY));
    const bodyText = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(bodyText)).toEqual({
      error: {
        code: "authentication_failed",
        message: "The AI service could not authenticate the request.",
      },
    });
    expect(bodyText).not.toContain("route-sprout-test-key");
    expect(bodyText).not.toContain("upstream");
  });

  it("does not expose incomplete diagnostics, usage, reasoning tokens, or raw output", async () => {
    openAiSdkMock.create.mockResolvedValue({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [
        {
          type: "reasoning",
          id: "reasoning-1",
          summary: [],
        },
      ],
      output_text: "private partial provider output",
      usage: {
        input_tokens: 180,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 700,
        output_tokens_details: { reasoning_tokens: 680 },
        total_tokens: 880,
      },
    } as unknown as OpenAIResponse);

    const response = await POST(createRequest(VALID_BODY));
    const bodyText = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(bodyText)).toEqual({
      error: {
        code: "response_incomplete",
        message: "The AI service did not finish the analysis.",
      },
    });
    expect(bodyText).not.toContain("max_output_tokens");
    expect(bodyText).not.toContain("incomplete_details");
    expect(bodyText).not.toContain("usage");
    expect(bodyText).not.toContain("reasoning_tokens");
    expect(bodyText).not.toContain("private partial provider output");
  });
});
