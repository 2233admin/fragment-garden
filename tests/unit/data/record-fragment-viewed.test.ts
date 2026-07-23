import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { recordFragmentViewed } from "../../../services/record-fragment-viewed";
import {
  STAGE_TWO_TEST_DATE,
  STAGE_TWO_TEST_TIMESTAMP,
  createIdSequence,
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("record-viewed");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("recordFragmentViewed", () => {
  it("records one view, updates interaction time, and restores dormant state", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({
      vitality: "dormant",
      stage: "growing",
      growthScore: 2,
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await recordFragmentViewed(
      { fragmentId: fragment.id },
      {
        database,
        createId: createIdSequence(["viewed-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "active",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.plant).toMatchObject({
      vitality: "active",
      stage: "growing",
      growthScore: 2,
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.viewedEvent).toEqual({
      id: "viewed-event",
      fragmentId: fragment.id,
      type: "viewed",
      payload: null,
      occurredAt: STAGE_TWO_TEST_TIMESTAMP,
      ruleVersion: 1,
    });
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([result.viewedEvent]);
  });

  it("does not change plant growth when viewing an active fragment", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant({
      stage: "budding",
      growthScore: 4,
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await recordFragmentViewed(
      { fragmentId: fragment.id },
      {
        database,
        createId: createIdSequence(["active-viewed-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.plant).toEqual(plant);
  });

  it("rolls back fragment and plant restoration when the event write fails", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    const existingEvent = createStageTwoEvent("viewed", {
      id: "event-collision",
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(existingEvent);

    await expect(
      recordFragmentViewed(
        { fragmentId: fragment.id },
        {
          database,
          createId: createIdSequence([existingEvent.id]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
  });
});
