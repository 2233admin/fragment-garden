import { describe, expect, it } from "vitest";

import { buildGardenPlantSnapshot, type Fragment, type Plant } from "../../../domain";

const TEST_TIMESTAMP = "2026-07-23T00:00:00.000Z";

function createFragment(id: string, overrides: Partial<Fragment> = {}): Fragment {
  return {
    id,
    contentType: "text",
    title: `标题 ${id}`,
    rawText: `不应进入 Phaser 的正文 ${id}`,
    sourceUrl: null,
    contentMarkdown: `不应进入 Phaser 的正文 ${id}`,
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    lastInteractedAt: TEST_TIMESTAMP,
    completedAt: null,
    ...overrides,
  };
}

function createPlant(
  id: string,
  fragmentId: string,
  slotId: string | null,
  overrides: Partial<Plant> = {},
): Plant {
  return {
    id,
    fragmentId,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

describe("buildGardenPlantSnapshot", () => {
  it("combines fragment display data with plant state without exposing raw text", () => {
    const fragment = createFragment("fragment-1", {
      title: "进入花园的标题",
      completionStatus: "completed",
    });
    const plant = createPlant("plant-1", fragment.id, "slot-03", {
      speciesId: "lavender",
      stage: "permanent_bloom",
      vitality: "dormant",
    });

    const snapshot = buildGardenPlantSnapshot([fragment], [plant]);

    expect(snapshot).toEqual({
      plants: [
        {
          plantId: plant.id,
          fragmentId: fragment.id,
          slotId: "slot-03",
          title: "进入花园的标题",
          speciesId: "lavender",
          stage: "permanent_bloom",
          vitality: "dormant",
          completionStatus: "completed",
        },
      ],
      placedPlantCount: 1,
      unplacedPlantCount: 0,
    });
    expect(snapshot.plants[0]).not.toHaveProperty("rawText");
  });

  it("excludes deleted and archived fragments from the main garden", () => {
    const activeFragment = createFragment("fragment-active");
    const deletedFragment = createFragment("fragment-deleted", {
      lifecycleStatus: "deleted",
    });
    const archivedFragment = createFragment("fragment-archived", {
      lifecycleStatus: "archived",
    });
    const plants = [
      createPlant("plant-active", activeFragment.id, "slot-01"),
      createPlant("plant-deleted", deletedFragment.id, "slot-02"),
      createPlant("plant-archived", archivedFragment.id, "slot-03"),
    ];

    const snapshot = buildGardenPlantSnapshot(
      [activeFragment, deletedFragment, archivedFragment],
      plants,
    );

    expect(snapshot.plants.map((plant) => plant.plantId)).toEqual(["plant-active"]);
    expect(snapshot).toMatchObject({
      placedPlantCount: 1,
      unplacedPlantCount: 0,
    });
  });

  it("counts eligible null-slot plants without sending them to Phaser", () => {
    const placedFragment = createFragment("fragment-placed");
    const unplacedFragment = createFragment("fragment-unplaced");
    const archivedFragment = createFragment("fragment-archived", {
      lifecycleStatus: "archived",
    });

    const snapshot = buildGardenPlantSnapshot(
      [placedFragment, unplacedFragment, archivedFragment],
      [
        createPlant("plant-placed", placedFragment.id, "slot-02"),
        createPlant("plant-unplaced", unplacedFragment.id, null),
        createPlant("plant-archived", archivedFragment.id, null),
      ],
    );

    expect(snapshot.plants).toHaveLength(1);
    expect(snapshot.placedPlantCount).toBe(1);
    expect(snapshot.unplacedPlantCount).toBe(1);
  });

  it("sorts output by slot id and then plant id without mutating inputs", () => {
    const fragments = [
      createFragment("fragment-c"),
      createFragment("fragment-b"),
      createFragment("fragment-a"),
    ];
    const plants = [
      createPlant("plant-c", "fragment-c", "slot-10"),
      createPlant("plant-b", "fragment-b", "slot-02"),
      createPlant("plant-a", "fragment-a", "slot-02"),
    ];
    const originalPlantOrder = plants.map((plant) => plant.id);

    const snapshot = buildGardenPlantSnapshot(fragments, plants);

    expect(snapshot.plants.map((plant) => plant.plantId)).toEqual([
      "plant-a",
      "plant-b",
      "plant-c",
    ]);
    expect(plants.map((plant) => plant.id)).toEqual(originalPlantOrder);
  });

  it("ignores a plant whose fragment cannot be found", () => {
    const snapshot = buildGardenPlantSnapshot(
      [],
      [createPlant("orphan-plant", "missing-fragment", "slot-01")],
    );

    expect(snapshot).toEqual({
      plants: [],
      placedPlantCount: 0,
      unplacedPlantCount: 0,
    });
  });
});
