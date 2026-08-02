import { describe, expect, it } from "vitest";

import type { PlantViewModel } from "../../../domain/garden/plant-view-model";
import { GARDEN_ZONE_CONFIGS } from "../../../game/config/garden-zones";
import {
  GARDEN_GROWTH_LAYER_NAMES,
  type GardenGrowthLayerName,
} from "../../../game/config/tiled-garden-map";
import {
  GardenGrowthSystem,
  type GardenGrowthLayerController,
} from "../../../game/systems/GardenGrowthSystem";

function createPlant(slotId: string, index: number): PlantViewModel {
  return {
    plantId: `plant-${index}`,
    fragmentId: `fragment-${index}`,
    slotId,
    title: `笔记 ${index}`,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    completionStatus: "open",
  };
}

function createLayerHarness(): Readonly<{
  layers: ReadonlyMap<GardenGrowthLayerName, GardenGrowthLayerController>;
  visibility: Map<GardenGrowthLayerName, boolean>;
}> {
  const visibility = new Map<GardenGrowthLayerName, boolean>();
  const layers = new Map<GardenGrowthLayerName, GardenGrowthLayerController>();

  for (const layerName of GARDEN_GROWTH_LAYER_NAMES) {
    visibility.set(layerName, false);
    layers.set(layerName, {
      setVisible(isVisible: boolean): void {
        visibility.set(layerName, isVisible);
      },
    });
  }

  return { layers, visibility };
}

describe("GardenGrowthSystem", () => {
  it("keeps every optional layer hidden for an empty garden", () => {
    const harness = createLayerHarness();
    const system = new GardenGrowthSystem(harness.layers, null);

    expect(system.update([])).toEqual({
      globalStage: 0,
      zoneLevels: {
        greenhouse_front: 0,
        woodland: 0,
        center_left: 0,
        center_right: 0,
        pond: 0,
        entrance: 0,
      },
    });
    expect([...harness.visibility.values()].every((isVisible) => !isVisible)).toBe(true);
  });

  it("updates global and local layers from the currently placed plants", () => {
    const harness = createLayerHarness();
    const system = new GardenGrowthSystem(harness.layers, null);
    const plants = GARDEN_ZONE_CONFIGS[0].slotIds
      .slice(0, 4)
      .map((slotId, index) => createPlant(slotId, index));

    const snapshot = system.update(plants);

    expect(snapshot.globalStage).toBe(1);
    expect(snapshot.zoneLevels.greenhouse_front).toBe(2);
    expect(snapshot.zoneLevels.woodland).toBe(0);
    expect(harness.visibility.get("GlobalGrowth1Low")).toBe(true);
    expect(harness.visibility.get("GlobalGrowth2Low")).toBe(false);
    expect(harness.visibility.get("Zone_greenhouse_front_Growth1")).toBe(true);
    expect(harness.visibility.get("Zone_greenhouse_front_Growth2")).toBe(true);
    expect(harness.visibility.get("Zone_greenhouse_front_Growth3")).toBe(false);
    expect(harness.visibility.get("Zone_woodland_Growth1")).toBe(false);
  });

  it("reveals every growth layer in a full garden and hides later layers after removal", () => {
    const harness = createLayerHarness();
    const system = new GardenGrowthSystem(harness.layers, null);
    const plants = GARDEN_ZONE_CONFIGS.flatMap((zone) => zone.slotIds).map((slotId, index) =>
      createPlant(slotId, index),
    );

    expect(system.update(plants).globalStage).toBe(4);
    expect([...harness.visibility.values()].every(Boolean)).toBe(true);

    system.update(plants.slice(0, 3));
    expect(harness.visibility.get("GlobalGrowth1Low")).toBe(false);
    expect(harness.visibility.get("GlobalGrowth4Above")).toBe(false);
    expect(harness.visibility.get("Zone_greenhouse_front_Growth2")).toBe(true);
    expect(harness.visibility.get("Zone_greenhouse_front_Growth3")).toBe(false);
  });

  it("uses the development preview without changing plant data", () => {
    const harness = createLayerHarness();
    const system = new GardenGrowthSystem(harness.layers, 4);
    const plants: PlantViewModel[] = [];

    const snapshot = system.update(plants);

    expect(snapshot.globalStage).toBe(4);
    expect(Object.values(snapshot.zoneLevels).every((level) => level === 3)).toBe(true);
    expect([...harness.visibility.values()].every(Boolean)).toBe(true);
    expect(plants).toEqual([]);
  });
});
