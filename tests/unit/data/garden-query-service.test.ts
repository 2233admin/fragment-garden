import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { FragmentRepository } from "../../../data/repositories/fragment-repository";
import { PlantRepository } from "../../../data/repositories/plant-repository";
import {
  queryGardenPlantSnapshot,
  queryGardenSummary,
} from "../../../services/garden-query-service";
import { createStageTwoFragment, createStageTwoPlant } from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-query-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("queryGardenPlantSnapshot", () => {
  it("uses one bulk read per table and never performs per-record lookups", async () => {
    const firstFragment = createStageTwoFragment({
      id: "fragment-1",
      title: "第一株",
    });
    const secondFragment = createStageTwoFragment({
      id: "fragment-2",
      title: "等待槽位",
    });
    await database.fragments.bulkAdd([firstFragment, secondFragment]);
    await database.plants.bulkAdd([
      createStageTwoPlant({
        id: "plant-1",
        fragmentId: firstFragment.id,
        slotId: "slot-01",
      }),
      createStageTwoPlant({
        id: "plant-2",
        fragmentId: secondFragment.id,
        slotId: null,
      }),
    ]);

    const fragmentListSpy = vi.spyOn(FragmentRepository.prototype, "list");
    const plantListSpy = vi.spyOn(PlantRepository.prototype, "list");
    const fragmentLookupSpy = vi.spyOn(FragmentRepository.prototype, "getById");
    const plantLookupSpy = vi.spyOn(PlantRepository.prototype, "getByFragmentId");

    const snapshot = await queryGardenPlantSnapshot(database);

    expect(fragmentListSpy).toHaveBeenCalledTimes(1);
    expect(plantListSpy).toHaveBeenCalledTimes(1);
    expect(fragmentLookupSpy).not.toHaveBeenCalled();
    expect(plantLookupSpy).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      placedPlantCount: 1,
      unplacedPlantCount: 1,
    });
    expect(snapshot.plants.map((plant) => plant.title)).toEqual(["第一株"]);
  });
});

describe("queryGardenSummary", () => {
  it("does not expose deleted content in NPC garden counts", async () => {
    await database.fragments.bulkAdd([
      createStageTwoFragment({ id: "active", lifecycleStatus: "active" }),
      createStageTwoFragment({ id: "dormant", lifecycleStatus: "dormant" }),
      createStageTwoFragment({
        id: "completed",
        lifecycleStatus: "active",
        completionStatus: "completed",
      }),
      createStageTwoFragment({ id: "archived", lifecycleStatus: "archived" }),
      createStageTwoFragment({
        id: "deleted-completed",
        lifecycleStatus: "deleted",
        completionStatus: "completed",
      }),
    ]);

    await expect(queryGardenSummary(database)).resolves.toEqual({
      activeCount: 2,
      dormantCount: 1,
      completedCount: 1,
      archivedCount: 1,
    });
  });
});
