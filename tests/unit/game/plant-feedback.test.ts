import { describe, expect, it } from "vitest";

import type { PlantViewModel } from "../../../domain/garden/plant-view-model";
import {
  collectGardenPlantFeedbacks,
  resolvePlantTransitionFeedback,
} from "../../../game/config/plant-feedback";
import {
  resolvePlantFeedbackPreview,
  resolvePlantFeedbackPreviewTarget,
} from "../../../game/config/plant-feedback-preview";

function createPlant(plantId: string, overrides: Partial<PlantViewModel> = {}): PlantViewModel {
  return {
    plantId,
    fragmentId: `fragment-${plantId}`,
    slotId: "slot-01",
    title: plantId,
    speciesId: "sunflower",
    stage: "blooming",
    vitality: "active",
    completionStatus: "open",
    ...overrides,
  };
}

describe("plant feedback", () => {
  it("maps only real vitality transitions to dormant and restored feedback", () => {
    const active = createPlant("plant-01");
    const dormant = createPlant("plant-01", { vitality: "dormant" });

    expect(resolvePlantTransitionFeedback(active, dormant)).toBe("dormant");
    expect(resolvePlantTransitionFeedback(dormant, active)).toBe("restored");
    expect(
      resolvePlantTransitionFeedback(active, { ...active, stage: "permanent_bloom" }),
    ).toBeNull();
  });

  it("detects a newly planted card without replaying unchanged plants", () => {
    const existing = createPlant("plant-existing");
    const created = createPlant("plant-created", { slotId: "slot-02", stage: "seedling" });

    expect(collectGardenPlantFeedbacks([existing], [existing, created])).toEqual([
      { plantId: created.plantId, kind: "created" },
    ]);
    expect(collectGardenPlantFeedbacks([existing], [{ ...existing }])).toEqual([]);
  });

  it("caps a single update so a bulk restore cannot animate the whole garden at once", () => {
    const plants = Array.from({ length: 8 }, (_, index) =>
      createPlant(`plant-${index + 1}`, { slotId: `slot-0${index + 1}` }),
    );

    expect(collectGardenPlantFeedbacks([], plants)).toHaveLength(3);
  });

  it("keeps feedback previews development-only and selects dormant content when required", () => {
    const active = createPlant("active");
    const dormant = createPlant("dormant", { vitality: "dormant" });

    expect(resolvePlantFeedbackPreview("?plantFeedbackPreview=restored", "development")).toBe(
      "restored",
    );
    expect(resolvePlantFeedbackPreview("?plantFeedbackPreview=restored", "production")).toBeNull();
    expect(resolvePlantFeedbackPreview("?plantFeedbackPreview=unknown", "development")).toBeNull();
    expect(resolvePlantFeedbackPreviewTarget([active, dormant], "restored")).toBe(dormant);
    expect(resolvePlantFeedbackPreviewTarget([active, dormant], "created")).toBe(active);
  });
});
