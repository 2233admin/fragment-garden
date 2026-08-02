import type {
  FragmentAnalysisStatus,
  FragmentCompletionStatus,
  FragmentContentType,
  FragmentLifecycleStatus,
  LinkImportStatus,
  PlantStage,
  MediaAssetKind,
  MediaProcessingStatus,
} from "../../domain";
import {
  markdownToPlainText,
  resolveFragmentContentMarkdown,
} from "../../domain/fragments/content-markdown";
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
  contentMarkdown: string;
  rawText: string;
  excerpt: string;
  searchText: string;
  sourceUrl: string | null;
  sourceHostname: string | null;
  analysisStatus: FragmentAnalysisStatus;
  linkImportStatus: LinkImportStatus | null;
  linkImportErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  lastInteractedAt: string;
  lifecycleStatus: FragmentLifecycleStatus;
  completionStatus: FragmentCompletionStatus;
  plantStage: PlantStage;
  growthScore: number;
  isPlacedInGarden: boolean;
  mediaKind: MediaAssetKind | null;
  mediaProcessingStatus: MediaProcessingStatus | null;
  mediaSizeBytes: number | null;
  mediaDurationMs: number | null;
  mediaBlob: Blob | null;
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
    [database.fragments, database.plants, database.externalLinkImports, database.mediaAssets],
    async () => {
      const fragments = await fragmentRepository.listVisibleFragments();
      const fragmentIds = new Set(fragments.map((fragment) => fragment.id));
      const [plants, linkImports, mediaAssets] = await Promise.all([
        plantRepository.listByFragmentIds([...fragmentIds]),
        database.externalLinkImports.toArray(),
        database.mediaAssets
          .where("kind")
          .equals("image")
          .and((asset) => fragmentIds.has(asset.fragmentId))
          .toArray(),
      ]);
      const plantByFragmentId = new Map(plants.map((plant) => [plant.fragmentId, plant] as const));
      const linkImportByFragmentId = new Map(
        linkImports.map((linkImport) => [linkImport.fragmentId, linkImport] as const),
      );
      const mediaByFragmentId = new Map<string, (typeof mediaAssets)[number]>();
      for (const mediaAsset of mediaAssets.sort((left, right) => {
        const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
        return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
      })) {
        // Legacy databases may contain a duplicate; expose one deterministic primary asset.
        if (!mediaByFragmentId.has(mediaAsset.fragmentId)) {
          mediaByFragmentId.set(mediaAsset.fragmentId, mediaAsset);
        }
      }

      return fragments.map((fragment) => {
        const plant = plantByFragmentId.get(fragment.id);
        const linkImport = linkImportByFragmentId.get(fragment.id);
        const mediaAsset = mediaByFragmentId.get(fragment.id);

        if (plant === undefined) {
          throw new Error(`Plant not found for fragment ${fragment.id}`);
        }

        const rawText = fragment.rawText ?? "";
        const contentMarkdown = resolveFragmentContentMarkdown(
          fragment,
          linkImport ?? null,
          mediaAsset ?? null,
        );
        const readableContent = markdownToPlainText(contentMarkdown);
        const searchText = [readableContent, rawText, fragment.summary, fragment.sourceUrl]
          .filter((value): value is string => value !== null && value.length > 0)
          .join(" ");

        return {
          id: fragment.id,
          plantId: plant.id,
          contentType: fragment.contentType,
          title: fragment.title,
          contentMarkdown,
          rawText,
          excerpt: deriveFragmentExcerpt(readableContent),
          searchText,
          sourceUrl: fragment.sourceUrl,
          sourceHostname: deriveSourceHostname(fragment.sourceUrl),
          analysisStatus: fragment.analysisStatus,
          linkImportStatus: linkImport?.status ?? null,
          linkImportErrorMessage: linkImport?.errorMessage ?? null,
          createdAt: fragment.createdAt,
          updatedAt: fragment.updatedAt,
          lastInteractedAt: fragment.lastInteractedAt,
          lifecycleStatus: fragment.lifecycleStatus,
          completionStatus: fragment.completionStatus,
          plantStage: plant.stage,
          growthScore: plant.growthScore,
          isPlacedInGarden: plant.slotId !== null,
          mediaKind: mediaAsset?.kind ?? (fragment.contentType === "audio" ? "audio" : null),
          mediaProcessingStatus: mediaAsset?.processingStatus ?? null,
          mediaSizeBytes: mediaAsset?.sizeBytes ?? null,
          mediaDurationMs: mediaAsset?.durationMs ?? null,
          mediaBlob: mediaAsset?.kind === "image" ? mediaAsset.blob : null,
        };
      });
    },
  );
}
