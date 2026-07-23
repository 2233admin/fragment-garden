import type { PlantViewModel } from "../../domain/garden/plant-view-model";

export type PlantRenderDiff = Readonly<{
  added: readonly PlantViewModel[];
  updated: readonly PlantViewModel[];
  removedPlantIds: readonly string[];
}>;

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function indexPlantsById(plants: readonly PlantViewModel[]): Map<string, PlantViewModel> {
  const plantById = new Map<string, PlantViewModel>();

  for (const plant of plants) {
    plantById.set(plant.plantId, plant);
  }

  return plantById;
}

function hasSameRenderableState(left: PlantViewModel, right: PlantViewModel): boolean {
  return (
    left.plantId === right.plantId &&
    left.fragmentId === right.fragmentId &&
    left.slotId === right.slotId &&
    left.title === right.title &&
    left.speciesId === right.speciesId &&
    left.stage === right.stage &&
    left.vitality === right.vitality &&
    left.completionStatus === right.completionStatus
  );
}

export function calculatePlantRenderDiff(
  previousPlants: readonly PlantViewModel[],
  nextPlants: readonly PlantViewModel[],
): PlantRenderDiff {
  const previousById = indexPlantsById(previousPlants);
  const nextById = indexPlantsById(nextPlants);
  const added: PlantViewModel[] = [];
  const updated: PlantViewModel[] = [];

  for (const plantId of [...nextById.keys()].sort(compareStrings)) {
    const nextPlant = nextById.get(plantId);

    if (nextPlant === undefined) {
      continue;
    }

    const previousPlant = previousById.get(plantId);

    if (previousPlant === undefined) {
      added.push(nextPlant);
    } else if (!hasSameRenderableState(previousPlant, nextPlant)) {
      updated.push(nextPlant);
    }
  }

  const removedPlantIds = [...previousById.keys()]
    .filter((plantId) => !nextById.has(plantId))
    .sort(compareStrings);

  return {
    added,
    updated,
    removedPlantIds,
  };
}
