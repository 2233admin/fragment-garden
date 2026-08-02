import { describe, expect, it } from "vitest";

import type { PlantViewModel } from "../../../domain/garden/plant-view-model";
import {
  CONTENT_PLANT_SPECIES_CONFIGS,
  CONTENT_PLANT_SPECIES_IDS,
  hashPlantId,
  resolveContentPlantAppearance,
  resolveContentPlantDisplaySize,
  resolveContentPlantFrame,
  resolveContentPlantSpecies,
  resolveContentPlantTextureSource,
} from "../../../game/config/content-plant-species";
import {
  getContentPlantPreviewPlants,
  getContentPlantPreviewVisualState,
  resolveContentPlantPreview,
} from "../../../game/config/content-plant-preview";

function createPlant(overrides: Partial<PlantViewModel> = {}): PlantViewModel {
  return {
    plantId: "plant-stable",
    fragmentId: "fragment-stable",
    slotId: "slot-01",
    title: "稳定内容花",
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    completionStatus: "open",
    ...overrides,
  };
}

describe("content plant species", () => {
  it.each(CONTENT_PLANT_SPECIES_IDS)("keeps recognized species %s", (speciesId) => {
    expect(resolveContentPlantSpecies(createPlant({ speciesId }))).toBe(speciesId);
  });

  it("maps missing and unsupported species from plantId without randomness", () => {
    const missingSpecies = createPlant({ plantId: "plant-null", speciesId: null });
    const unsupportedSpecies = createPlant({
      plantId: "plant-legacy",
      speciesId: "small_tree",
    });

    expect(resolveContentPlantSpecies({ ...missingSpecies })).toBe(
      resolveContentPlantSpecies({ ...missingSpecies }),
    );
    expect(resolveContentPlantSpecies({ ...unsupportedSpecies })).toBe(
      resolveContentPlantSpecies({ ...unsupportedSpecies }),
    );
    expect(hashPlantId("plant-null")).toBe(hashPlantId("plant-null"));
    expect(CONTENT_PLANT_SPECIES_IDS).toContain(resolveContentPlantSpecies(missingSpecies));
    expect(CONTENT_PLANT_SPECIES_IDS).toContain(resolveContentPlantSpecies(unsupportedSpecies));
  });

  it("maps every family and growth stage to a stable atlas frame", () => {
    const stages = ["seedling", "growing", "budding", "blooming", "permanent_bloom"] as const;

    for (const [familyIndex, speciesId] of CONTENT_PLANT_SPECIES_IDS.entries()) {
      for (const [stageIndex, stage] of stages.entries()) {
        expect(resolveContentPlantFrame(createPlant({ speciesId, stage }))).toBe(
          familyIndex * stages.length + stageIndex,
        );
      }
    }
  });

  it("defines a readable visual footprint for every family and growth stage", () => {
    const stages = ["seedling", "growing", "budding", "blooming", "permanent_bloom"] as const;

    for (const speciesId of CONTENT_PLANT_SPECIES_IDS) {
      const sizes = stages.map((stage) =>
        resolveContentPlantDisplaySize(createPlant({ speciesId, stage })),
      );

      expect(sizes.every(({ height, width }) => height > 0 && width > 0)).toBe(true);
      expect(sizes.at(-1)?.height).toBeGreaterThanOrEqual(sizes[0].height);
      expect(sizes.at(-1)?.width).toBeGreaterThan(sizes[0].width);
    }
  });

  it("keeps each click target within one 64px plant slot", () => {
    for (const config of Object.values(CONTENT_PLANT_SPECIES_CONFIGS)) {
      expect(config.hitArea.height).toBeLessThanOrEqual(64);
      expect(config.hitArea.width).toBeLessThanOrEqual(64);
    }
  });

  it("uses permanent bloom for completed notes and a calm dormant treatment", () => {
    expect(
      resolveContentPlantFrame(
        createPlant({
          speciesId: "sunflower",
          stage: "seedling",
          completionStatus: "completed",
        }),
      ),
    ).toBe(4);
    expect(resolveContentPlantAppearance("dormant", false)).toEqual({
      alpha: 0.9,
      idleMotionEnabled: false,
      tint: 0xa8b2aa,
    });
    expect(resolveContentPlantAppearance("active", true).idleMotionEnabled).toBe(false);
  });

  it("selects the generated fallback only when the runtime texture is unavailable", () => {
    expect(resolveContentPlantTextureSource(true)).toBe("content");
    expect(resolveContentPlantTextureSource(false)).toBe("fallback");
  });
});

describe("content plant development preview", () => {
  it.each(["overview", "stages", "states", "polished", "5", "18", "36"] as const)(
    "accepts %s only in development",
    (mode) => {
      expect(resolveContentPlantPreview(`?contentPlantPreview=${mode}`, "development")).toBe(mode);
      expect(resolveContentPlantPreview(`?contentPlantPreview=${mode}`, "production")).toBeNull();
    },
  );

  it("provides three families, five stages, and explicit state fixtures", () => {
    expect(
      new Set(getContentPlantPreviewPlants("overview").map((plant) => plant.speciesId)),
    ).toEqual(new Set(["sunflower", "lavender", "dandelion"]));
    expect(getContentPlantPreviewPlants("stages").map((plant) => plant.stage)).toEqual([
      "seedling",
      "growing",
      "budding",
      "blooming",
      "permanent_bloom",
    ]);
    expect(getContentPlantPreviewVisualState("states", "content-preview-state-hover")).toBe(
      "hover",
    );
    expect(getContentPlantPreviewVisualState("states", "content-preview-state-selected")).toBe(
      "selected",
    );
    expect(getContentPlantPreviewVisualState("overview", "content-preview-state-hover")).toBeNull();
  });

  it.each([
    ["5", 5],
    ["18", 18],
    ["36", 36],
  ] as const)("builds a representative %s-plant density preview", (mode, expectedCount) => {
    const plants = getContentPlantPreviewPlants(mode);

    expect(plants).toHaveLength(expectedCount);
    expect(new Set(plants.map((plant) => plant.slotId)).size).toBe(expectedCount);
    expect(new Set(plants.map((plant) => plant.speciesId)).size).toBe(3);
  });

  it("marks one full-garden preview plant as selected without changing its data", () => {
    expect(getContentPlantPreviewVisualState("36", "content-preview-density-18")).toBe("selected");
    expect(getContentPlantPreviewVisualState("18", "content-preview-density-18")).toBeNull();
  });
});
