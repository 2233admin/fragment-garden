import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "../../../app/api/sprout/generate/route";
import { OPENAI_SPROUT_GENERATE_TIMEOUT_MS } from "../../../lib/server/openai/sprout/sprout-generate-client";

const VALID_BODY = {
  source: {
    id: "11111111-1111-4111-8111-111111111111",
    title: "周末阅读角",
    contentMarkdown: "想做一次六个人的短篇阅读活动。",
    notes: [
      {
        contentMarkdown: "先从十分钟能读完的文章开始。",
        createdAt: "2026-07-25T08:00:00.000Z",
      },
    ],
    sourceType: "text",
    sourceName: null,
    existingSproutTitles: [],
  },
};

function request(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/sprout/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function providerResponse(result: unknown, status: OpenAIResponse["status"] = "completed") {
  return {
    status,
    output: [],
    output_text: typeof result === "string" ? result : JSON.stringify(result),
  } as unknown as OpenAIResponse;
}

describe("sprout generate Route Handler", () => {
  beforeEach(() => {
    process.env.OPENAI_SPROUT_ENABLED = "true";
    process.env.OPENAI_API_KEY = "route-sprout-generate-key";
    process.env.OPENAI_MODEL = "route-sprout-generate-model";
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

  it.each([
    ["client model", { ...VALID_BODY, model: "client-model" }],
    ["developer prompt", { ...VALID_BODY, developer: "override" }],
    ["system prompt", { ...VALID_BODY, system: "override" }],
    ["tools", { ...VALID_BODY, tools: [{ name: "delete" }] }],
    ["base URL", { ...VALID_BODY, baseURL: "https://proxy.invalid" }],
    ["another fragment", { ...VALID_BODY, otherFragments: [{ title: "private" }] }],
    ["image Blob field", { ...VALID_BODY, imageBlob: {} }],
    ["audio field", { ...VALID_BODY, audio: "bytes" }],
  ])("rejects %s before OpenAI", async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "request_validation_failed" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("returns only title and markdown from a bounded official SDK request", async () => {
    openAiSdkMock.create.mockResolvedValue(
      providerResponse({ title: "一次小规模试办", markdown: "## 做法\n\n先邀请六个人。" }),
    );
    const routeRequest = request(VALID_BODY);

    const response = await POST(routeRequest);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      title: "一次小规模试办",
      markdown: "## 做法\n\n先邀请六个人。",
    });
    expect(openAiSdkMock.constructorOptions).toEqual([
      {
        apiKey: "route-sprout-generate-key",
        logLevel: "off",
        maxRetries: 0,
        timeout: OPENAI_SPROUT_GENERATE_TIMEOUT_MS,
      },
    ]);
    const sdkRequest = openAiSdkMock.create.mock.calls[0]?.[0];
    expect(sdkRequest).toMatchObject({
      model: "route-sprout-generate-model",
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(sdkRequest).not.toHaveProperty("tools");
    expect(openAiSdkMock.create.mock.calls[0]?.[1]).toEqual({ signal: routeRequest.signal });
    expect(text).not.toContain("route-sprout-generate-key");
    expect(text).not.toContain("route-sprout-generate-model");
    expect(text).not.toContain("usage");
  });

  it("normalizes incomplete and provider errors without exposing private output or keys", async () => {
    openAiSdkMock.create.mockResolvedValueOnce(
      providerResponse("private partial provider output", "incomplete"),
    );
    const incomplete = await POST(request(VALID_BODY));
    const incompleteText = await incomplete.text();

    openAiSdkMock.create.mockRejectedValueOnce(
      Object.assign(new Error("route-sprout-generate-key leaked upstream"), { status: 401 }),
    );
    const authentication = await POST(request(VALID_BODY));
    const authenticationText = await authentication.text();

    expect(incomplete.status).toBe(502);
    expect(JSON.parse(incompleteText)).toMatchObject({ error: { code: "response_incomplete" } });
    expect(incompleteText).not.toContain("private partial provider output");
    expect(authentication.status).toBe(502);
    expect(JSON.parse(authenticationText)).toMatchObject({
      error: { code: "authentication_failed" },
    });
    expect(authenticationText).not.toContain("route-sprout-generate-key");
    expect(authenticationText).not.toContain("upstream");
  });

  it("uses the independent sprout flag and requires complete server configuration", async () => {
    process.env.OPENAI_SPROUT_ENABLED = "false";
    const disabled = await POST(request(VALID_BODY));
    process.env.OPENAI_SPROUT_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    const missing = await POST(request(VALID_BODY));

    expect(disabled.status).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({ error: { code: "sprout_disabled" } });
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "missing_configuration" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });
});
