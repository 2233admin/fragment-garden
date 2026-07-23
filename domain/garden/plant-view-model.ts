import type {
  Fragment,
  FragmentCompletionStatus,
  Plant,
  PlantSpeciesId,
  PlantStage,
  PlantVitality,
} from "../shared/types";

export type PlantViewModel = {
  plantId: string;
  fragmentId: string;
  slotId: string;
  title: string;
  speciesId: PlantSpeciesId | null;
  stage: PlantStage;
  vitality: PlantVitality;
  completionStatus: FragmentCompletionStatus;
};

export type GardenPlantSnapshot = {
  plants: PlantViewModel[];
  placedPlantCount: number;
  unplacedPlantCount: number;
};

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function buildGardenPlantSnapshot(
  fragments: readonly Fragment[],
  plants: readonly Plant[],
): GardenPlantSnapshot {
  const fragmentById = new Map(fragments.map((fragment) => [fragment.id, fragment] as const));
  const placedPlants: PlantViewModel[] = [];
  let unplacedPlantCount = 0;

  for (const plant of plants) {
    const fragment = fragmentById.get(plant.fragmentId);

    if (
      fragment === undefined ||
      fragment.lifecycleStatus === "deleted" ||
      fragment.lifecycleStatus === "archived"
    ) {
      continue;
    }

    if (plant.slotId === null) {
      unplacedPlantCount += 1;
      continue;
    }

    placedPlants.push({
      plantId: plant.id,
      fragmentId: fragment.id,
      slotId: plant.slotId,
      title: fragment.title,
      speciesId: plant.speciesId,
      stage: plant.stage,
      vitality: plant.vitality,
      completionStatus: fragment.completionStatus,
    });
  }

  placedPlants.sort((left, right) => {
    const slotComparison = compareStrings(left.slotId, right.slotId);
    return slotComparison === 0 ? compareStrings(left.plantId, right.plantId) : slotComparison;
  });

  return {
    plants: placedPlants,
    placedPlantCount: placedPlants.length,
    unplacedPlantCount,
  };
}
