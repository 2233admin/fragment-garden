import type { ExternalLinkImport, Fragment, FragmentNote, MediaAsset } from "../../domain";
import { resolveFragmentContentMarkdown } from "../../domain/fragments/content-markdown";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { ExternalLinkImportRepository } from "../repositories/external-link-import-repository";
import { FragmentNoteRepository } from "../repositories/fragment-note-repository";
import { FragmentRepository } from "../repositories/fragment-repository";
import { MediaAssetRepository } from "../repositories/media-asset-repository";

export type MemoryStarDetailViewModel = Readonly<{
  fragment: Fragment;
  contentMarkdown: string;
  notes: readonly FragmentNote[];
  mediaAsset: MediaAsset | null;
  externalLinkImport: ExternalLinkImport | null;
}>;

export function getMemoryStarDetailViewModel(
  fragmentId: string,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<MemoryStarDetailViewModel | undefined> {
  const fragmentRepository = new FragmentRepository(database);
  const fragmentNoteRepository = new FragmentNoteRepository(database);
  const externalLinkImportRepository = new ExternalLinkImportRepository(database);
  const mediaAssetRepository = new MediaAssetRepository(database);

  return database.transaction(
    "r",
    [
      database.fragments,
      database.fragmentNotes,
      database.externalLinkImports,
      database.mediaAssets,
    ],
    async () => {
      const [fragment, notes, externalLinkImport, mediaAsset] = await Promise.all([
        fragmentRepository.getById(fragmentId),
        fragmentNoteRepository.listByFragmentId(fragmentId),
        externalLinkImportRepository.getByFragmentId(fragmentId),
        mediaAssetRepository.getByFragmentId(fragmentId),
      ]);

      if (fragment === undefined || fragment.lifecycleStatus === "deleted") {
        return undefined;
      }

      return {
        fragment,
        contentMarkdown: resolveFragmentContentMarkdown(
          fragment,
          externalLinkImport ?? null,
          mediaAsset ?? null,
        ),
        notes,
        mediaAsset: mediaAsset ?? null,
        externalLinkImport: externalLinkImport ?? null,
      };
    },
  );
}
