import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import { PLANT_FEEDBACK_KINDS, type PlantFeedbackKind } from "./plant-feedback";

const VALID_FEEDBACK_PREVIEWS = new Set<string>(PLANT_FEEDBACK_KINDS);

export function resolvePlantFeedbackPreview(
  search: string,
  environment: string | undefined,
): PlantFeedbackKind | null {
  if (environment !== "development") {
    return null;
  }

  const value = new URLSearchParams(search).get("plantFeedbackPreview");
  return value !== null && VALID_FEEDBACK_PREVIEWS.has(value) ? (value as PlantFeedbackKind) : null;
}

export function resolvePlantFeedbackPreviewTarget(
  plants: readonly PlantViewModel[],
  feedback: PlantFeedbackKind,
): PlantViewModel | null {
  if (feedback === "dormant" || feedback === "restored") {
    return plants.find((plant) => plant.vitality === "dormant") ?? plants[0] ?? null;
  }

  return plants[0] ?? null;
}
