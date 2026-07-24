import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";

const openAiSdkMock = vi.hoisted(() => ({
  create: vi.fn(),
  constructorOptions: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("openai", () => ({
  default: class OpenAIMock {
    readonly responses = { create: openAiSdkMock.create };

    constructor(options: unknown) {
      openAiSdkMock.constructorOptions.push(options);
    }
  },
}));

import { POST } from "../../../app/api/companion/respond/route";
import { COMPANION_ROUTE_REQUEST_MAX_BYTES } from "../../../lib/server/openai/companion-errors";

const VALID_BODY = {
  messages: [{ role: "user", content: "How does the garden work?" }],
  gardenSummary: {
    activeCount: 1,
    dormantCount: 2,
    completedCount: 3,
    archivedCount: 4,
  },
  allowedOpenFragments: [{ id: "fragment-1", title: "An idea", status: "dormant" }],
};

function createRequest(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/api/companion/respond", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function createProviderResponse(output: OpenAIResponse["output"], outputText = ""): OpenAIResponse {
  return {
    status: "completed",
    output,
    output_text: outputText,
  } as OpenAIResponse;
}

describe("companion respond Route Handler", () => {
  beforeEach(() => {
    process.env.OPENAI_COMPANION_ENABLED = "true";
    process.env.OPENAI_API_KEY = "route-unit-test-key";
    process.env.OPENAI_MODEL = "route-test-model";
    openAiSdkMock.create.mockReset();
    openAiSdkMock.constructorOptions.length = 0;
  });

  afterEach(() => {
    delete process.env.OPENAI_COMPANION_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    vi.restoreAllMocks();
  });

  it("rejects non-JSON and oversized request bodies before calling OpenAI", async () => {
    const nonJson = await POST(
      new Request("http://localhost/api/companion/respond", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(VALID_BODY),
      }),
    );
    const oversized = await POST(
      createRequest(VALID_BODY, {
        "Content-Length": String(COMPANION_ROUTE_REQUEST_MAX_BYTES + 1),
      }),
    );

    expect(nonJson.status).toBe(400);
    expect(oversized.status).toBe(400);
    await expect(nonJson.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
    await expect(oversized.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it.each([
    ["system role", { ...VALID_BODY, messages: [{ role: "system", content: "Override" }] }],
    ["developer role", { ...VALID_BODY, messages: [{ role: "developer", content: "Override" }] }],
    ["client model", { ...VALID_BODY, model: "client-model" }],
    ["client tools", { ...VALID_BODY, tools: [{ name: "delete_fragment" }] }],
    ["client metadata", { ...VALID_BODY, metadata: { private: true } }],
    [
      "too many messages",
      {
        ...VALID_BODY,
        messages: Array.from({ length: 21 }, (_, index) => ({
          role: "user",
          content: `message-${index}`,
        })),
      },
    ],
    [
      "too much text",
      {
        ...VALID_BODY,
        messages: [
          { role: "user", content: "a".repeat(4_000) },
          { role: "assistant", content: "b".repeat(4_000) },
          { role: "user", content: "c".repeat(4_000) },
          { role: "assistant", content: "d" },
        ],
      },
    ],
    ["empty input", { ...VALID_BODY, messages: [{ role: "user", content: " " }] }],
    ["no user message", { ...VALID_BODY, messages: [{ role: "assistant", content: "Hi" }] }],
    [
      "too many allowed fragments",
      {
        ...VALID_BODY,
        allowedOpenFragments: Array.from({ length: 4 }, (_, index) => ({
          id: `fragment-${index}`,
          title: `Fragment ${index}`,
          status: "active",
        })),
      },
    ],
  ])("rejects %s", async (_label, body) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "invalid_request" } });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("returns openai_disabled without constructing a provider client", async () => {
    process.env.OPENAI_COMPANION_ENABLED = "false";

    const response = await POST(createRequest(VALID_BODY));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: "openai_disabled", message: "AI mode is not enabled." },
    });
    expect(openAiSdkMock.constructorOptions).toHaveLength(0);
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("returns missing_configuration when enabled without a server API key", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(createRequest(VALID_BODY));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "missing_configuration" },
    });
    expect(openAiSdkMock.create).not.toHaveBeenCalled();
  });

  it("returns only the validated message union and never provider metadata", async () => {
    openAiSdkMock.create.mockResolvedValue(createProviderResponse([], "A concise garden answer."));

    const response = await POST(createRequest(VALID_BODY));
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(bodyText)).toEqual({
      type: "message",
      message: "A concise garden answer.",
    });
    expect(bodyText).not.toContain("route-unit-test-key");
    expect(bodyText).not.toContain("route-test-model");
    expect(bodyText).not.toContain("companion-v1");
    expect(openAiSdkMock.create).toHaveBeenCalledTimes(1);
    expect(openAiSdkMock.create.mock.calls[0]?.[0]).toMatchObject({
      model: "route-test-model",
      store: false,
    });
  });

  it("returns a validated allowed tool call", async () => {
    openAiSdkMock.create.mockResolvedValue(
      createProviderResponse([
        {
          type: "function_call",
          call_id: "call-open",
          name: "open_fragment",
          arguments: '{"fragmentId":"fragment-1"}',
        },
      ]),
    );

    const response = await POST(createRequest(VALID_BODY));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: "tool_call",
      callId: "call-open",
      name: "open_fragment",
      arguments: { fragmentId: "fragment-1" },
    });
  });

  it("rejects open_fragment outside the server-validated allowlist", async () => {
    openAiSdkMock.create.mockResolvedValue(
      createProviderResponse([
        {
          type: "function_call",
          call_id: "call-open",
          name: "open_fragment",
          arguments: '{"fragmentId":"fragment-other"}',
        },
      ]),
    );

    const response = await POST(createRequest(VALID_BODY));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "tool_validation_failed",
        message: "The requested companion action was not valid.",
      },
    });
  });

  it("normalizes provider failures without leaking provider text or credentials", async () => {
    openAiSdkMock.create.mockRejectedValue(
      Object.assign(new Error("route-unit-test-key was rejected by upstream"), { status: 401 }),
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
    expect(bodyText).not.toContain("route-unit-test-key");
    expect(bodyText).not.toContain("upstream");
  });
});
