import type {
  FragmentAnalysisStatus,
  FragmentCompletionStatus,
  FragmentContentType,
  FragmentLifecycleStatus,
  LinkImportStatus,
  PlantStage,
} from "../../domain";
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
  contentType: FragmentContentType;
  title: string;
  rawText: string;
  excerpt: string;
  searchText: string;
  sourceUrl: string | null;
  sourceHostname: string | null;
  analysisStatus: FragmentAnalysisStatus;
  linkImportStatus: LinkImportStatus | null;
  linkImportErrorMessage: string | null;
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

function deriveSourceHostname(sourceUrl: string | null): string | null {
  if (sourceUrl === null) {
    return null;
  }

  try {
    return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

export function listFragmentCardViewModels(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FragmentCardViewModel[]> {
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);

  return database.transaction(
    "r",
    [database.fragments, database.plants, database.externalLinkImports],
    async () => {
      const fragments = await fragmentRepository.listVisibleFragments();
      const [plants, linkImports] = await Promise.all([
        plantRepository.listByFragmentIds(fragments.map((fragment) => fragment.id)),
        database.externalLinkImports.toArray(),
      ]);
      const plantByFragmentId = new Map(plants.map((plant) => [plant.fragmentId, plant] as const));
      const linkImportByFragmentId = new Map(
        linkImports.map((linkImport) => [linkImport.fragmentId, linkImport] as const),
      );

      return fragments.map((fragment) => {
        const plant = plantByFragmentId.get(fragment.id);
        const linkImport = linkImportByFragmentId.get(fragment.id);

        if (plant === undefined) {
          throw new Error(`Plant not found for fragment ${fragment.id}`);
        }

        const rawText = fragment.rawText ?? "";
        const excerptSource =
          fragment.contentType === "link" ? (fragment.summary ?? rawText) : rawText;
        const searchText = [rawText, fragment.summary, fragment.sourceUrl]
          .filter((value): value is string => value !== null && value.length > 0)
          .join(" ");

        return {
          id: fragment.id,
          plantId: plant.id,
          contentType: fragment.contentType,
          title: fragment.title,
          rawText,
          excerpt: deriveFragmentExcerpt(excerptSource),
          searchText,
          sourceUrl: fragment.sourceUrl,
          sourceHostname: deriveSourceHostname(fragment.sourceUrl),
          analysisStatus: fragment.analysisStatus,
          linkImportStatus: linkImport?.status ?? null,
          linkImportErrorMessage: linkImport?.errorMessage ?? null,
          createdAt: fragment.createdAt,
          lastInteractedAt: fragment.lastInteractedAt,
          lifecycleStatus: fragment.lifecycleStatus,
          completionStatus: fragment.completionStatus,
          plantStage: plant.stage,
          growthScore: plant.growthScore,
          isPlacedInGarden: plant.slotId !== null,
        };
      });
    },
  );
}
