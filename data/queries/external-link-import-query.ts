import type { ExternalLinkImport, Fragment } from "../../domain/shared/types";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { ExternalLinkImportRepository } from "../repositories/external-link-import-repository";
import { FragmentRepository } from "../repositories/fragment-repository";

export type ExistingExternalLinkImport = Readonly<{
  externalLinkImport: ExternalLinkImport;
  fragment: Fragment;
}>;

export async function findExistingExternalLinkImport(
  normalizedUrl: string,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<ExistingExternalLinkImport | null> {
  const externalLinkImportRepository = new ExternalLinkImportRepository(database);
  const fragmentRepository = new FragmentRepository(database);
  const externalLinkImports = await externalLinkImportRepository.listByNormalizedUrl(normalizedUrl);
  const fragments = await fragmentRepository.listByIds(
    externalLinkImports.map(({ fragmentId }) => fragmentId),
  );
  const fragmentById = new Map(fragments.map((fragment) => [fragment.id, fragment]));

  for (const externalLinkImport of externalLinkImports) {
    const fragment = fragmentById.get(externalLinkImport.fragmentId);

    if (fragment !== undefined && fragment.lifecycleStatus !== "deleted") {
      return { externalLinkImport, fragment };
    }
  }

  return null;
}
