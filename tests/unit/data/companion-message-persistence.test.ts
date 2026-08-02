import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import {
  appendCompanionAssistantMessageOnce,
  completeCompanionUserMessage,
  createPendingCompanionUserMessage,
  failCompanionUserMessage,
} from "../../../services/companion-message-persistence";

const NOW = "2026-07-27T08:30:00.000Z";
let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(
    `fragment-garden-companion-persistence-${crypto.randomUUID()}`,
  );
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

describe("companion message persistence", () => {
  it("writes a pending user first and transitions it without changing its id", async () => {
    const pending = await createPendingCompanionUserMessage(
      { content: "  hello  ", clientRequestId: "request-1", now: NOW },
      { database, createId: () => "user-1" },
    );
    expect(pending).toMatchObject({
      id: "user-1",
      content: "hello",
      status: "pending",
      clientRequestId: "request-1",
    });

    const completed = await completeCompanionUserMessage("request-1", { database });
    expect(completed).toMatchObject({ id: "user-1", status: "completed" });
  });

  it("is idempotent for the same request and permits a failed retry", async () => {
    const first = await createPendingCompanionUserMessage(
      { content: "hello", clientRequestId: "request-2", now: NOW },
      { database, createId: () => "user-2" },
    );
    const repeated = await createPendingCompanionUserMessage(
      { content: "changed", clientRequestId: "request-2", now: NOW },
      { database, createId: () => "different" },
    );
    expect(repeated).toEqual(first);

    await failCompanionUserMessage("request-2", "request_timeout", { database });
    const retried = await createPendingCompanionUserMessage(
      { content: "hello", clientRequestId: "request-2", now: NOW },
      { database, createId: () => "different" },
    );
    expect(retried).toMatchObject({ id: "user-2", status: "pending", errorCode: null });
    await expect(database.chatMessages.count()).resolves.toBe(1);
  });

  it("writes one assistant result for a request even when completion is repeated", async () => {
    const input = {
      content: "done",
      clientRequestId: "request-3:assistant",
      source: "openai" as const,
      now: NOW,
    };
    const first = await appendCompanionAssistantMessageOnce(input, {
      database,
      createId: () => "assistant-1",
    });
    const repeated = await appendCompanionAssistantMessageOnce(input, {
      database,
      createId: () => "assistant-2",
    });
    expect(repeated).toEqual(first);
    await expect(database.chatMessages.count()).resolves.toBe(1);
  });
});
