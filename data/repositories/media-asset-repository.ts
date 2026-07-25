import type { MediaAsset, MediaAssetKind, MediaProcessingStatus } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type MediaAssetUpdate = Partial<
  Omit<MediaAsset, "id" | "fragmentId" | "kind" | "createdAt">
>;

function compareMediaAssets(left: MediaAsset, right: MediaAsset): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
}

/** Repository boundary for local media Blobs and their derived processing state. */
export class MediaAssetRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  getById(id: string): Promise<MediaAsset | undefined> {
    return this.database.mediaAssets.get(id);
  }

  async getByFragmentId(fragmentId: string): Promise<MediaAsset | undefined> {
    const assets = await this.database.mediaAssets.where("fragmentId").equals(fragmentId).toArray();

    return assets.sort(compareMediaAssets)[0];
  }

  async listByFragmentIds(fragmentIds: readonly string[]): Promise<MediaAsset[]> {
    const uniqueFragmentIds = [...new Set(fragmentIds)];
    if (uniqueFragmentIds.length === 0) {
      return [];
    }

    const assets = await this.database.mediaAssets
      .where("fragmentId")
      .anyOf(uniqueFragmentIds)
      .toArray();

    return assets.sort(compareMediaAssets);
  }

  list(): Promise<MediaAsset[]> {
    return this.database.mediaAssets.toArray().then((assets) => assets.sort(compareMediaAssets));
  }

  async listByKind(kind: MediaAssetKind): Promise<MediaAsset[]> {
    const assets = await this.database.mediaAssets.where("kind").equals(kind).toArray();
    return assets.sort(compareMediaAssets);
  }

  async listByProcessingStatuses(
    statuses: readonly MediaProcessingStatus[],
  ): Promise<MediaAsset[]> {
    const uniqueStatuses = [...new Set(statuses)];
    if (uniqueStatuses.length === 0) {
      return [];
    }

    const assets = await this.database.mediaAssets
      .where("processingStatus")
      .anyOf(uniqueStatuses)
      .toArray();

    return assets.sort(compareMediaAssets);
  }

  listByProcessingStatus(status: MediaProcessingStatus): Promise<MediaAsset[]> {
    return this.listByProcessingStatuses([status]);
  }

  add(asset: MediaAsset): Promise<string> {
    return this.database.mediaAssets.add(asset);
  }

  put(asset: MediaAsset): Promise<string> {
    return this.database.mediaAssets.put(asset);
  }

  update(id: string, changes: MediaAssetUpdate): Promise<number> {
    return this.database.mediaAssets.update(id, changes);
  }

  delete(id: string): Promise<void> {
    return this.database.mediaAssets.delete(id);
  }
}
