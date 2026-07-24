import type { ExternalLinkImport, LinkImportStatus } from "../../domain/shared/types";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type ExternalLinkImportUpdate = Partial<
  Omit<
    ExternalLinkImport,
    "id" | "fragmentId" | "provider" | "sourceUrl" | "normalizedUrl" | "createdAt"
  >
>;

function compareExternalLinkImports(left: ExternalLinkImport, right: ExternalLinkImport): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
}

function normalizeExternalLinkImport(externalLinkImport: ExternalLinkImport): ExternalLinkImport {
  return externalLinkImport.sourceContent === undefined
    ? { ...externalLinkImport, sourceContent: null }
    : externalLinkImport;
}

export class ExternalLinkImportRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  async getById(id: string): Promise<ExternalLinkImport | undefined> {
    const externalLinkImport = await this.database.externalLinkImports.get(id);
    return externalLinkImport === undefined
      ? undefined
      : normalizeExternalLinkImport(externalLinkImport);
  }

  async getByFragmentId(fragmentId: string): Promise<ExternalLinkImport | undefined> {
    const externalLinkImport = await this.database.externalLinkImports
      .where("fragmentId")
      .equals(fragmentId)
      .first();
    return externalLinkImport === undefined
      ? undefined
      : normalizeExternalLinkImport(externalLinkImport);
  }

  async listByNormalizedUrl(normalizedUrl: string): Promise<ExternalLinkImport[]> {
    const imports = await this.database.externalLinkImports
      .where("normalizedUrl")
      .equals(normalizedUrl)
      .toArray();

    return imports.map(normalizeExternalLinkImport).sort(compareExternalLinkImports);
  }

  async listByStatuses(statuses: readonly LinkImportStatus[]): Promise<ExternalLinkImport[]> {
    const uniqueStatuses = [...new Set(statuses)];
    if (uniqueStatuses.length === 0) {
      return [];
    }

    const imports = await this.database.externalLinkImports
      .where("status")
      .anyOf(uniqueStatuses)
      .toArray();

    return imports.map(normalizeExternalLinkImport).sort(compareExternalLinkImports);
  }

  add(externalLinkImport: ExternalLinkImport): Promise<string> {
    return this.database.externalLinkImports.add(externalLinkImport);
  }

  update(id: string, changes: ExternalLinkImportUpdate): Promise<number> {
    return this.database.externalLinkImports.update(id, changes);
  }
}
