import { describe, expect, it } from "vitest";

import type { PlantViewModel } from "../../../domain/garden/plant-view-model";
import { calculatePlantRenderDiff } from "../../../game/systems/plant-render-diff";

function createPlant(plantId: string, overrides: Partial<PlantViewModel> = {}): PlantViewModel {
  return {
    plantId,
    fragmentId: `fragment-${plantId}`,
    slotId: "slot-01",
    title: `植物 ${plantId}`,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    completionStatus: "open",
    ...overrides,
  };
}

describe("calculatePlantRenderDiff", () => {
  it("calculates deterministic added, updated, and removed collections by plantId", () => {
    const previousPlants = [
      createPlant("plant-03"),
      createPlant("plant-01"),
      createPlant("plant-04"),
    ];
    const nextPlants = [
      createPlant("plant-02"),
      createPlant("plant-01", { stage: "growing" }),
      createPlant("plant-04"),
      createPlant("plant-00"),
    ];

    const diff = calculatePlantRenderDiff(previousPlants, nextPlants);

    expect(diff.added.map((plant) => plant.plantId)).toEqual(["plant-00", "plant-02"]);
    expect(diff.updated).toEqual([createPlant("plant-01", { stage: "growing" })]);
    expect(diff.removedPlantIds).toEqual(["plant-03"]);
  });

  it("produces no operations for a repeated identical LOAD_GARDEN", () => {
    const plants = [
      createPlant("plant-02", { slotId: "slot-02" }),
      createPlant("plant-01", { slotId: "slot-01" }),
    ];

    expect(calculatePlantRenderDiff(plants, [...plants])).toEqual({
      added: [],
      updated: [],
      removedPlantIds: [],
    });
  });

  it("deduplicates repeated plantIds in the next snapshot", () => {
    const earlierState = createPlant("plant-01", { stage: "seedling" });
    const latestState = createPlant("plant-01", { stage: "growing" });

    const diff = calculatePlantRenderDiff([], [earlierState, latestState]);

    expect(diff.added).toEqual([latestState]);
    expect(new Set(diff.added.map((plant) => plant.plantId)).size).toBe(diff.added.length);
  });

  it("removes a plantId when it is absent from the next snapshot", () => {
    const removedPlant = createPlant("plant-removed");

    expect(calculatePlantRenderDiff([removedPlant], []).removedPlantIds).toEqual([
      removedPlant.plantId,
    ]);
  });

  it("treats every renderable field change as an update", () => {
    const original = createPlant("plant-01");
    const changes: ReadonlyArray<Partial<PlantViewModel>> = [
      { fragmentId: "fragment-new" },
      { slotId: "slot-02" },
      { title: "新标题" },
      { speciesId: "dandelion" },
      { stage: "growing" },
      { vitality: "dormant" },
      { completionStatus: "completed" },
    ];

    for (const change of changes) {
      const changed = { ...original, ...change };
      expect(calculatePlantRenderDiff([original], [changed]).updated).toEqual([changed]);
    }
  });
});
