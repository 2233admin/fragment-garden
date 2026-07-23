import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Recommendation, Settings } from "../../../domain";
import { dismissFragmentRecommendation } from "../../../services/dismiss-fragment-recommendation";
import { openFragmentRecommendation } from "../../../services/open-fragment-recommendation";
import { requestDailyFragmentRecommendation } from "../../../services/request-daily-fragment-recommendation";
import { requestFragmentRecommendation } from "../../../services/request-fragment-recommendation";
import {
  createIdSequence,
  createStageTwoDatabase,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

const NOW = "2026-07-27T08:30:00.000Z";

let database: ReturnType<typeof createStageTwoDatabase>;

beforeEach(async () => {
  database = createStageTwoDatabase("stage-six-recommendation");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function selectedSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: "local-user",
    onboardingCompleted: true,
    companionType: "cat",
    lastOpenedAt: null,
    lastRecommendationDate: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function shownRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "recommendation-1",
    fragmentId: "fragment-1",
    reason: "dormant",
    shownAt: NOW,
    openedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

async function seedOldFragment(
  fragmentOverrides: Parameters<typeof createStageTwoFragment>[0] = {},
  plantOverrides: Parameters<typeof createStageTwoPlant>[0] = {},
): Promise<void> {
  await database.fragments.add(
    createStageTwoFragment({
      createdAt: "2026-07-20T08:30:00.000Z",
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
      ...fragmentOverrides,
    }),
  );
  await database.plants.add(createStageTwoPlant(plantOverrides));
}

describe("requestFragmentRecommendation", () => {
  it("writes only when an eligible recommendation is shown and avoids a same-day repeat", async () => {
    await seedOldFragment();

    const first = await requestFragmentRecommendation(
      { now: NOW },
      { database, createId: () => "recommendation-1" },
    );
    const repeated = await requestFragmentRecommendation(
      { now: NOW },
      { database, createId: () => "unused" },
    );

    expect(first).toMatchObject({
      fragment: { id: "fragment-1" },
      recommendation: {
        id: "recommendation-1",
        openedAt: null,
        dismissedAt: null,
      },
    });
    expect(repeated).toBeNull();
    await expect(database.recommendations.count()).resolves.toBe(1);
  });
});

describe("requestDailyFragmentRecommendation", () => {
  it("uses Settings.lastRecommendationDate transactionally under concurrent calls", async () => {
    await database.settings.add(selectedSettings());
    await seedOldFragment();

    const results = await Promise.all([
      requestDailyFragmentRecommendation(
        { now: NOW },
        { database, createId: () => crypto.randomUUID() },
      ),
      requestDailyFragmentRecommendation(
        { now: NOW },
        { database, createId: () => crypto.randomUUID() },
      ),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    await expect(database.recommendations.count()).resolves.toBe(1);
    await expect(database.settings.get("local-user")).resolves.toMatchObject({
      lastRecommendationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("does not consume the daily opportunity when no candidate exists", async () => {
    await database.settings.add(selectedSettings());

    await expect(
      requestDailyFragmentRecommendation({ now: NOW }, { database, createId: () => "unused" }),
    ).resolves.toBeNull();
    await expect(database.settings.get("local-user")).resolves.toMatchObject({
      lastRecommendationDate: null,
    });
    await expect(database.recommendations.count()).resolves.toBe(0);
  });

  it("rolls back the shown recommendation if the daily marker cannot be saved", async () => {
    await database.settings.add(selectedSettings());
    await seedOldFragment();
    database.settings.hook("updating", () => {
      throw new Error("simulated settings failure");
    });

    await expect(
      requestDailyFragmentRecommendation(
        { now: NOW },
        { database, createId: () => "recommendation-1" },
      ),
    ).rejects.toThrow("simulated settings failure");

    await expect(database.recommendations.count()).resolves.toBe(0);
    await expect(database.settings.get("local-user")).resolves.toMatchObject({
      lastRecommendationDate: null,
    });
  });
});

describe("recommendation decisions", () => {
  it("opens atomically through recordFragmentViewed and restores dormant content", async () => {
    await seedOldFragment(
      { lifecycleStatus: "dormant" },
      { vitality: "dormant", slotId: "slot-01" },
    );
    await database.recommendations.add(shownRecommendation());

    const result = await openFragmentRecommendation(
      { recommendationId: "recommendation-1", now: NOW },
      {
        database,
        createId: createIdSequence(["viewed-event", "restored-event"]),
      },
    );

    expect(result.recommendation.openedAt).toBe(NOW);
    expect(result.viewed.fragment.lifecycleStatus).toBe("active");
    expect(result.viewed.plant.vitality).toBe("active");
    expect(result.viewed.restoredEvent?.type).toBe("restored");
    const eventTypes = (
      await database.fragmentEvents.where("fragmentId").equals("fragment-1").toArray()
    ).map(({ type }) => type);
    expect(new Set(eventTypes)).toEqual(new Set(["viewed", "restored"]));
  });

  it("rolls back the opened status and restored records if viewed persistence fails", async () => {
    await seedOldFragment(
      { lifecycleStatus: "dormant" },
      { vitality: "dormant", slotId: "slot-01" },
    );
    await database.recommendations.add(shownRecommendation());
    database.fragmentEvents.hook("creating", () => {
      throw new Error("simulated viewed event failure");
    });

    await expect(
      openFragmentRecommendation(
        { recommendationId: "recommendation-1", now: NOW },
        {
          database,
          createId: createIdSequence(["viewed-event", "restored-event"]),
        },
      ),
    ).rejects.toThrow("simulated viewed event failure");

    await expect(database.recommendations.get("recommendation-1")).resolves.toMatchObject({
      openedAt: null,
    });
    await expect(database.fragments.get("fragment-1")).resolves.toMatchObject({
      lifecycleStatus: "dormant",
    });
    await expect(database.plants.get("plant-1")).resolves.toMatchObject({
      vitality: "dormant",
    });
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("dismisses without modifying the fragment, plant, events, or growth", async () => {
    await seedOldFragment();
    await database.recommendations.add(
      shownRecommendation({
        reason: "not_reviewed",
      }),
    );
    const fragmentBefore = await database.fragments.get("fragment-1");
    const plantBefore = await database.plants.get("plant-1");

    const dismissed = await dismissFragmentRecommendation(
      { recommendationId: "recommendation-1", now: NOW },
      { database },
    );

    expect(dismissed.dismissedAt).toBe(NOW);
    await expect(database.fragments.get("fragment-1")).resolves.toEqual(fragmentBefore);
    await expect(database.plants.get("plant-1")).resolves.toEqual(plantBefore);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });
});
