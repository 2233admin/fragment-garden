import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalDateKey } from "../../../domain/sprout/local-date";
import { FragmentGardenDatabase } from "../../../data/db";
import { savePartnerSuggestion } from "../../../services/save-partner-suggestion";
import {
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

const FIRST_LOCAL_TIME = "2026-07-24T08:30:00";
const SECOND_LOCAL_TIME = "2026-07-24T16:30:00";
const NEXT_LOCAL_DAY = "2026-07-25T08:30:00";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("save-partner-suggestion");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function suggestionInput(
  overrides: Partial<Parameters<typeof savePartnerSuggestion>[0]> = {},
): Parameters<typeof savePartnerSuggestion>[0] {
  return {
    fragmentId: "fragment-1",
    suggestionId: "suggestion-1",
    direction: "先明确最想减少分心的一个具体场景",
    guidingQuestion: "哪个时段最值得先观察？",
    recommendedAction: "record_next_step",
    promptVersion: "sprout-v1",
    now: FIRST_LOCAL_TIME,
    ...overrides,
  };
}

async function seedFragment(
  fragmentOverrides: Parameters<typeof createStageTwoFragment>[0] = {},
  plantOverrides: Parameters<typeof createStageTwoPlant>[0] = {},
): Promise<void> {
  await database.fragments.add(createStageTwoFragment(fragmentOverrides));
  await database.plants.add(createStageTwoPlant(plantOverrides));
}

describe("savePartnerSuggestion", () => {
  it("stores one structured partner addition without changing user-authored content", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await savePartnerSuggestion(suggestionInput(), {
      database,
      createId: () => {
        throw new Error("An active fragment does not need a restored event id");
      },
    });

    expect(result.partnerSuggestionSavedEvent).toEqual({
      id: "suggestion-1",
      fragmentId: fragment.id,
      type: "partner_suggestion_saved",
      payload: {
        direction: "先明确最想减少分心的一个具体场景",
        guidingQuestion: "哪个时段最值得先观察？",
        recommendedAction: "record_next_step",
        source: "partner",
        promptVersion: "sprout-v1",
        localDateKey: createLocalDateKey(new Date(FIRST_LOCAL_TIME)),
      },
      occurredAt: new Date(FIRST_LOCAL_TIME).toISOString(),
      ruleVersion: 1,
    });
    expect(result.suggestion).toMatchObject({
      id: "suggestion-1",
      fragmentId: fragment.id,
      source: "partner",
      direction: "先明确最想减少分心的一个具体场景",
    });
    expect(result.fragment).toMatchObject({
      title: fragment.title,
      rawText: fragment.rawText,
      completionStatus: fragment.completionStatus,
      lifecycleStatus: "active",
    });
    expect(result.plant).toMatchObject({ growthScore: 1, stage: "growing" });
    expect(result.didAwardGrowth).toBe(true);
    await expect(database.fragmentEvents.count()).resolves.toBe(1);
  });

  it("saves multiple suggestions but awards growth once per browser-local date", async () => {
    await seedFragment();

    await savePartnerSuggestion(suggestionInput(), { database });
    const sameDay = await savePartnerSuggestion(
      suggestionInput({
        suggestionId: "suggestion-2",
        direction: "改从使用场景切入",
        now: SECOND_LOCAL_TIME,
      }),
      { database },
    );
    const nextDay = await savePartnerSuggestion(
      suggestionInput({
        suggestionId: "suggestion-3",
        direction: "改从最小验证切入",
        now: NEXT_LOCAL_DAY,
      }),
      { database },
    );

    expect(sameDay.didAwardGrowth).toBe(false);
    expect(sameDay.plant.growthScore).toBe(1);
    expect(nextDay.didAwardGrowth).toBe(true);
    expect(nextDay.plant.growthScore).toBe(2);
    await expect(
      database.fragmentEvents.where("type").equals("partner_suggestion_saved").count(),
    ).resolves.toBe(3);
  });

  it("uses the suggestion id as an idempotency key even when a retry crosses midnight", async () => {
    await seedFragment();

    const first = await savePartnerSuggestion(suggestionInput(), { database });
    const retry = await savePartnerSuggestion(suggestionInput({ now: NEXT_LOCAL_DAY }), {
      database,
      createId: () => {
        throw new Error("An idempotent retry must not create another event");
      },
    });

    expect(retry.partnerSuggestionSavedEvent).toEqual(first.partnerSuggestionSavedEvent);
    expect(retry.didAwardGrowth).toBe(false);
    expect(retry.plant.growthScore).toBe(1);
    await expect(database.fragmentEvents.count()).resolves.toBe(1);

    await expect(
      savePartnerSuggestion(suggestionInput({ direction: "同一个 ID 的另一条内容" }), {
        database,
      }),
    ).rejects.toThrow("already in use");
  });

  it("serializes concurrent saves of the same suggestion", async () => {
    await seedFragment();

    const results = await Promise.all([
      savePartnerSuggestion(suggestionInput(), { database }),
      savePartnerSuggestion(suggestionInput(), { database }),
    ]);

    expect(results.filter((result) => result.didAwardGrowth)).toHaveLength(1);
    expect(results.every((result) => result.plant.growthScore === 1)).toBe(true);
    await expect(database.fragmentEvents.count()).resolves.toBe(1);
  });

  it("restores dormant content through the existing restoration event", async () => {
    await seedFragment({ lifecycleStatus: "dormant" }, { vitality: "dormant", stage: "seedling" });

    const result = await savePartnerSuggestion(suggestionInput(), {
      database,
      createId: () => "restored-event",
    });

    expect(result.fragment.lifecycleStatus).toBe("active");
    expect(result.plant).toMatchObject({ vitality: "active", growthScore: 1 });
    expect(result.restoredEvent).toMatchObject({
      id: "restored-event",
      type: "restored",
      payload: { reason: "content_updated" },
    });
  });

  it("preserves completed and archived boundaries without allocating a slot", async () => {
    await seedFragment(
      {
        lifecycleStatus: "archived",
        completionStatus: "completed",
        completedAt: "2026-07-23T09:00:00.000Z",
      },
      {
        stage: "permanent_bloom",
        slotId: null,
      },
    );

    const result = await savePartnerSuggestion(
      suggestionInput({ recommendedAction: "grow_new_idea" }),
      { database },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "archived",
      completionStatus: "completed",
      completedAt: "2026-07-23T09:00:00.000Z",
    });
    expect(result.plant).toMatchObject({
      stage: "permanent_bloom",
      slotId: null,
      growthScore: 1,
    });

    await expect(
      savePartnerSuggestion(
        suggestionInput({
          suggestionId: "invalid-completion",
          recommendedAction: "mark_completed",
        }),
        { database },
      ),
    ).rejects.toThrow("not compatible");
  });

  it("rejects deleted fragments and does not revive their data", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "deleted" });
    const plant = createStageTwoPlant({ slotId: null });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await expect(savePartnerSuggestion(suggestionInput(), { database })).rejects.toThrow(
      "cannot be changed",
    );
    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("rolls back fragment, plant and suggestion writes when restoration persistence fails", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    const collidingEvent = createStageTwoEvent("viewed", { id: "restored-collision" });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(collidingEvent);

    await expect(
      savePartnerSuggestion(suggestionInput(), {
        database,
        createId: () => collidingEvent.id,
      }),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([collidingEvent]);
  });
});
