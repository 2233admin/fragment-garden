import { describe, expect, it, vi } from "vitest";

import {
  CompanionProviderError,
  OpenAICompanionResponseEngine,
} from "../../../domain/companion/response-engine";

const INPUT = {
  message: "current question",
  messages: [{ role: "user" as const, content: "current question" }],
  currentGardenSummary: {
    activeCount: 1,
    dormantCount: 0,
    completedCount: 0,
    archivedCount: 0,
  },
  allowedOpenFragments: [],
};

describe("OpenAICompanionResponseEngine", () => {
  it("sends the bounded context exactly once without provider credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(Response.json({ type: "message", message: "A bounded answer." }));

    await expect(new OpenAICompanionResponseEngine(fetchMock).respond(INPUT)).resolves.toEqual({
      type: "message",
      message: "A bounded answer.",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(requestInit?.body)) as {
      messages: readonly { role: string; content: string }[];
      gardenSummary: unknown;
      allowedOpenFragments: unknown;
    };
    expect(body.messages).toEqual([{ role: "user", content: "current question" }]);
    expect(body.gardenSummary).toEqual(INPUT.currentGardenSummary);
    expect(body.allowedOpenFragments).toEqual([]);
    expect(requestInit?.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("accepts a validated tool result without inventing provider fields", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      Response.json({
        type: "tool_call",
        callId: "call-1",
        name: "recommend_fragment",
        arguments: {},
      }),
    );

    await expect(new OpenAICompanionResponseEngine(fetchMock).respond(INPUT)).resolves.toEqual({
      type: "tool_call",
      callId: "call-1",
      name: "recommend_fragment",
      arguments: {},
    });
  });

  it("maps a normalized nested Route error instead of stringifying the object", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error: {
            code: "rate_limited",
            message: "The AI service is busy.",
          },
        },
        { status: 429 },
      ),
    );

    await expect(new OpenAICompanionResponseEngine(fetchMock).respond(INPUT)).rejects.toMatchObject(
      {
        code: "rate_limited",
        message: expect.stringContaining("AI"),
      },
    );
  });

  it("normalizes malformed successful responses", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(Response.json({ type: "message", message: "" }));

    const promise = new OpenAICompanionResponseEngine(fetchMock).respond(INPUT);
    await expect(promise).rejects.toBeInstanceOf(CompanionProviderError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_model_response" });
  });
});
