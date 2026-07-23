import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { listFragmentCardViewModels } from "../../../data/queries/fragment-card-query";
import { softDeleteFragment } from "../../../services/soft-delete-fragment";
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
  database = createStageTwoDatabase("soft-delete");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("softDeleteFragment", () => {
  it("marks the fragment deleted, records history, and leaves its plant unchanged", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant({
      stage: "growing",
      growthScore: 2,
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await softDeleteFragment(
      { fragmentId: fragment.id },
      {
        database,
        createId: createIdSequence(["deleted-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "deleted",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.deletedEvent).toEqual({
      id: "deleted-event",
      fragmentId: fragment.id,
      type: "deleted",
      payload: null,
      occurredAt: STAGE_TWO_TEST_TIMESTAMP,
      ruleVersion: 1,
    });
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(listFragmentCardViewModels(database)).resolves.toEqual([]);
  });

  it("rolls back the fragment update when the deleted event write fails", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    const existingEvent = createStageTwoEvent("viewed", {
      id: "event-collision",
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(existingEvent);

    await expect(
      softDeleteFragment(
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
