import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { sendCompanionTurn } from "../../../services/send-companion-turn";

const NOW = "2026-07-27T08:30:00.000Z";
const GARDEN_SUMMARY = {
  activeCount: 1,
  dormantCount: 0,
  completedCount: 0,
  archivedCount: 0,
};

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-companion-turn-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function createIdSequence(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    index += 1;
    if (id === undefined) {
      throw new Error("Test ID sequence exhausted");
    }
    return id;
  };
}

function createInput(clientRequestId: string) {
  return {
    content: "植物怎么才能开花？",
    mode: "openai" as const,
    gardenSummary: GARDEN_SUMMARY,
    allowedOpenFragments: [],
    now: NOW,
    clientRequestId,
    fallbackToLocal: false,
  };
}

describe("sendCompanionTurn fallback policy", () => {
  it("uses the local engine when OpenAI is disabled or not configured", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: { code: "missing_configuration", message: "The AI service is not configured." },
        },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendCompanionTurn(createInput("request-config"), {
      database,
      createId: createIdSequence(["user-config", "assistant-config"]),
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackErrorCode).toBe("missing_configuration");
    expect(result.response).toMatchObject({ type: "message" });
    await expect(database.chatMessages.toArray()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "user-config",
          role: "user",
          status: "completed",
        }),
        expect.objectContaining({
          id: "assistant-config",
          role: "assistant",
          source: "local",
          content: expect.stringContaining("AI 服务暂时不可用"),
        }),
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not silently fall back on a provider error when fallback is not requested", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: "rate_limited", message: "The AI service is busy." } },
          { status: 429 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendCompanionTurn(createInput("request-rate-limit"), {
        database,
        createId: createIdSequence(["user-rate-limit"]),
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });

    await expect(database.chatMessages.toArray()).resolves.toEqual([
      expect.objectContaining({
        id: "user-rate-limit",
        role: "user",
        status: "failed",
        errorCode: "rate_limited",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
