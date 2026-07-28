import type { PlantViewModel } from "../../domain/garden/plant-view-model";

export const PLANT_FEEDBACK_KINDS = Object.freeze([
  "created",
  "dormant",
  "restored",
  "arrived",
] as const);

export type PlantFeedbackKind = (typeof PLANT_FEEDBACK_KINDS)[number];
export type GardenPlantTransitionFeedbackKind = Exclude<PlantFeedbackKind, "arrived">;

export type GardenPlantFeedback = Readonly<{
  plantId: string;
  kind: GardenPlantTransitionFeedbackKind;
}>;

const MAX_TRANSITION_FEEDBACKS_PER_UPDATE = 3;

export function resolvePlantTransitionFeedback(
  previous: PlantViewModel,
  current: PlantViewModel,
): GardenPlantTransitionFeedbackKind | null {
  if (previous.vitality !== "dormant" && current.vitality === "dormant") {
    return "dormant";
  }

  if (previous.vitality === "dormant" && current.vitality !== "dormant") {
    return "restored";
  }

  return null;
}

export function collectGardenPlantFeedbacks(
  previousPlants: readonly PlantViewModel[],
  currentPlants: readonly PlantViewModel[],
): readonly GardenPlantFeedback[] {
  const previousById = new Map(previousPlants.map((plant) => [plant.plantId, plant] as const));
  const feedbacks: GardenPlantFeedback[] = [];

  for (const plant of currentPlants) {
    const previous = previousById.get(plant.plantId);
    const kind =
      previous === undefined ? "created" : resolvePlantTransitionFeedback(previous, plant);

    if (kind !== null) {
      feedbacks.push({ plantId: plant.plantId, kind });
    }

    if (feedbacks.length === MAX_TRANSITION_FEEDBACKS_PER_UPDATE) {
      break;
    }
  }

  return feedbacks;
}
