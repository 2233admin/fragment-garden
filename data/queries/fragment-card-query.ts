import type { FragmentCompletionStatus, FragmentLifecycleStatus, PlantStage } from "../../domain";
export {
  filterAndSortFragmentCards,
  filterFragmentCardsByStatus,
  type FragmentCardFilter,
  type FragmentCardSort,
} from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { FragmentRepository } from "../repositories/fragment-repository";
import { PlantRepository } from "../repositories/plant-repository";

const FRAGMENT_EXCERPT_MAX_CHARACTERS = 120;

export type FragmentCardViewModel = {
  id: string;
  plantId: string;
  title: string;
  rawText: string;
  excerpt: string;
  createdAt: string;
  lastInteractedAt: string;
  lifecycleStatus: FragmentLifecycleStatus;
  completionStatus: FragmentCompletionStatus;
  plantStage: PlantStage;
  growthScore: number;
  isPlacedInGarden: boolean;
};

function deriveFragmentExcerpt(rawText: string): string {
  const normalizedText = rawText.trim().replace(/\s+/gu, " ");
  const characters = Array.from(normalizedText);

  if (characters.length <= FRAGMENT_EXCERPT_MAX_CHARACTERS) {
    return normalizedText;
  }

  return `${characters.slice(0, FRAGMENT_EXCERPT_MAX_CHARACTERS - 1).join("")}…`;
}

export function listFragmentCardViewModels(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FragmentCardViewModel[]> {
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);

  return database.transaction("r", database.fragments, database.plants, async () => {
    const fragments = await fragmentRepository.listVisibleTextFragments();
    const plants = await plantRepository.listByFragmentIds(
      fragments.map((fragment) => fragment.id),
    );
    const plantByFragmentId = new Map(plants.map((plant) => [plant.fragmentId, plant] as const));

    return fragments.map((fragment) => {
      const plant = plantByFragmentId.get(fragment.id);

      if (plant === undefined) {
        throw new Error(`Plant not found for fragment ${fragment.id}`);
      }

      const rawText = fragment.rawText ?? "";

      return {
        id: fragment.id,
        plantId: plant.id,
        title: fragment.title,
        rawText,
        excerpt: deriveFragmentExcerpt(rawText),
        createdAt: fragment.createdAt,
        lastInteractedAt: fragment.lastInteractedAt,
        lifecycleStatus: fragment.lifecycleStatus,
        completionStatus: fragment.completionStatus,
        plantStage: plant.stage,
        growthScore: plant.growthScore,
        isPlacedInGarden: plant.slotId !== null,
      };
    });
  });
}
