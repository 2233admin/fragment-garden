import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getCurrentRecommendationView,
  listChatMessages,
  queryLocalSettings,
} from "../../../data/queries/companion-query";
import { ChatMessageRepository } from "../../../data/repositories/chat-message-repository";
import { completeCompanionOnboarding } from "../../../services/complete-companion-onboarding";
import {
  COMPANION_RECOMMENDATION_UNAVAILABLE_MESSAGE,
  sendCompanionMessage,
} from "../../../services/send-companion-message";
import {
  createIdSequence,
  createStageTwoDatabase,
  createStageTwoFragment,
} from "./stage-two-fixtures";

const NOW = "2026-07-27T08:30:00.000Z";

let database: ReturnType<typeof createStageTwoDatabase>;

beforeEach(async () => {
  database = createStageTwoDatabase("stage-six-chat");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("companion onboarding", () => {
  it("exposes default incomplete settings without persisting a synthetic record", async () => {
    await expect(queryLocalSettings(database)).resolves.toEqual({
      id: "local-user",
      onboardingCompleted: false,
      companionType: null,
      lastOpenedAt: null,
      lastRecommendationDate: null,
      getNoteDisclosureAcceptedAt: null,
      schemaVersion: 1,
    });
    await expect(database.settings.count()).resolves.toBe(0);
  });

  it.each(["cat", "dog"] as const)(
    "saves the selected %s and one shared welcome message atomically",
    async (companionType) => {
      const first = await completeCompanionOnboarding(
        { companionType, now: NOW },
        { database, createId: () => "welcome-message" },
      );
      const repeated = await completeCompanionOnboarding(
        { companionType, now: NOW },
        { database, createId: () => "unused-message" },
      );

      expect(first.settings).toMatchObject({
        onboardingCompleted: true,
        companionType,
      });
      expect(first.welcomeMessage?.content).toContain("陪你照看这座花园");
      expect(repeated.welcomeMessage).toBeNull();
      await expect(database.settings.get("local-user")).resolves.toEqual(first.settings);
      await expect(database.chatMessages.count()).resolves.toBe(1);
    },
  );

  it("rejects null-like input and does not allow changing the companion", async () => {
    await expect(
      completeCompanionOnboarding({ companionType: null, now: NOW } as never, {
        database,
        createId: () => "unused",
      }),
    ).rejects.toThrow("cat or dog");

    await completeCompanionOnboarding(
      { companionType: "cat", now: NOW },
      { database, createId: () => "welcome" },
    );
    await expect(
      completeCompanionOnboarding(
        { companionType: "dog", now: NOW },
        { database, createId: () => "unused" },
      ),
    ).rejects.toThrow("cannot be changed");
  });

  it("rolls back settings when the welcome message cannot be saved", async () => {
    database.chatMessages.hook("creating", () => {
      throw new Error("simulated welcome failure");
    });

    await expect(
      completeCompanionOnboarding(
        { companionType: "cat", now: NOW },
        { database, createId: () => "welcome" },
      ),
    ).rejects.toThrow("simulated welcome failure");

    await expect(database.settings.count()).resolves.toBe(0);
    await expect(database.chatMessages.count()).resolves.toBe(0);
  });

  it("does not leave a welcome message when settings persistence fails", async () => {
    database.settings.hook("creating", () => {
      throw new Error("simulated settings save failure");
    });

    await expect(
      completeCompanionOnboarding(
        { companionType: "dog", now: NOW },
        { database, createId: () => "welcome" },
      ),
    ).rejects.toThrow("simulated settings save failure");

    await expect(database.settings.count()).resolves.toBe(0);
    await expect(database.chatMessages.count()).resolves.toBe(0);
  });

  it("remains single-write safe when Strict Mode-like calls overlap", async () => {
    const results = await Promise.all([
      completeCompanionOnboarding(
        { companionType: "dog", now: NOW },
        { database, createId: () => crypto.randomUUID() },
      ),
      completeCompanionOnboarding(
        { companionType: "dog", now: NOW },
        { database, createId: () => crypto.randomUUID() },
      ),
    ]);

    expect(results.filter(({ welcomeMessage }) => welcomeMessage !== null)).toHaveLength(1);
    await expect(database.settings.count()).resolves.toBe(1);
    await expect(database.chatMessages.count()).resolves.toBe(1);
  });
});

describe("companion chat persistence", () => {
  it("stores the user and deterministic assistant messages in reading order", async () => {
    await completeCompanionOnboarding(
      { companionType: "cat", now: NOW },
      { database, createId: () => "welcome-message" },
    );
    const result = await sendCompanionMessage(
      { content: " 植物为什么休眠？ ", now: NOW },
      { database, createId: createIdSequence(["user-message", "assistant-message"]) },
    );
    const messagesFromFreshRepository = await new ChatMessageRepository(database).list();

    expect(result.userMessage.content).toBe("植物为什么休眠？");
    expect(result.assistantMessage.content).toContain("72 小时");
    expect(messagesFromFreshRepository.map(({ role }) => role)).toEqual([
      "assistant",
      "user",
      "assistant",
    ]);
    await expect(listChatMessages(database)).resolves.toEqual(messagesFromFreshRepository);
  });

  it("executes recommendation actions in the service and exposes the current view", async () => {
    await database.fragments.add(
      createStageTwoFragment({
        id: "old-fragment",
        title: "很久以前的想法",
        createdAt: "2026-07-20T08:30:00.000Z",
        lastInteractedAt: "2026-07-20T08:30:00.000Z",
      }),
    );

    const result = await sendCompanionMessage(
      { content: "推荐一条以前的想法", now: NOW },
      {
        database,
        createId: createIdSequence(["recommendation-1", "user-message", "assistant-message"]),
      },
    );

    expect(result.response.action).toEqual({ type: "RECOMMEND_FRAGMENT" });
    expect(result.recommendation?.fragment.id).toBe("old-fragment");
    await expect(getCurrentRecommendationView(database)).resolves.toMatchObject({
      recommendation: { id: "recommendation-1" },
      fragment: { id: "old-fragment" },
    });
  });

  it("persists a clear bounded response when no old fragment is eligible", async () => {
    const result = await sendCompanionMessage(
      { content: "我该看看什么？", now: NOW },
      { database, createId: createIdSequence(["user-message", "assistant-message"]) },
    );

    expect(result.recommendation).toBeNull();
    expect(result.assistantMessage.content).toBe(COMPANION_RECOMMENDATION_UNAVAILABLE_MESSAGE);
    await expect(database.recommendations.count()).resolves.toBe(0);
  });

  it("rolls back both messages and a recommendation when assistant persistence fails", async () => {
    await database.fragments.add(
      createStageTwoFragment({
        id: "old-fragment",
        createdAt: "2026-07-20T08:30:00.000Z",
        lastInteractedAt: "2026-07-20T08:30:00.000Z",
      }),
    );
    let createdMessageCount = 0;
    database.chatMessages.hook("creating", () => {
      createdMessageCount += 1;
      if (createdMessageCount === 2) {
        throw new Error("simulated assistant save failure");
      }
    });

    await expect(
      sendCompanionMessage(
        { content: "带我回顾一下", now: NOW },
        {
          database,
          createId: createIdSequence(["recommendation-1", "user-message", "assistant-message"]),
        },
      ),
    ).rejects.toThrow("simulated assistant save failure");

    await expect(database.chatMessages.count()).resolves.toBe(0);
    await expect(database.recommendations.count()).resolves.toBe(0);
  });
});
