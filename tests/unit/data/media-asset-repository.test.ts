import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MediaAsset } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { MediaAssetRepository } from "../../../data/repositories/media-asset-repository";

let database: FragmentGardenDatabase;

function createMediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    fragmentId: "fragment-1",
    kind: "image",
    blob: new Blob(["image"], { type: "image/png" }),
    mimeType: "image/png",
    fileName: "capture.png",
    sizeBytes: 5,
    width: 2,
    height: 3,
    durationMs: null,
    processingStatus: "pending",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: "图片想法 · 2026/07/24 16:30",
    generatedTitle: null,
    summary: null,
    visibleText: null,
    contentKind: null,
    transcript: null,
    originalTranscript: null,
    transcriptEditedAt: null,
    createdAt: "2026-07-24T08:30:00.000Z",
    updatedAt: "2026-07-24T08:30:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-media-repository-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("MediaAssetRepository", () => {
  it("persists and queries media by fragment, kind, status, and id", async () => {
    const repository = new MediaAssetRepository(database);
    const first = createMediaAsset();
    const second = createMediaAsset({
      id: "asset-2",
      fragmentId: "fragment-2",
      kind: "audio",
      mimeType: "audio/webm",
      fileName: null,
      width: null,
      height: null,
      durationMs: 1200,
      processingStatus: "completed",
      createdAt: "2026-07-25T08:30:00.000Z",
    });

    await repository.add(first);
    await repository.add(second);

    await expect(repository.getById(first.id)).resolves.toEqual(first);
    await expect(repository.getByFragmentId(first.fragmentId)).resolves.toEqual(first);
    await expect(repository.listByFragmentIds(["fragment-2", "fragment-1"])).resolves.toEqual([
      first,
      second,
    ]);
    await expect(repository.listByKind("audio")).resolves.toEqual([second]);
    await expect(repository.listByProcessingStatuses(["completed"])).resolves.toEqual([second]);
  });

  it("updates and deletes one media record without touching its fragment id", async () => {
    const repository = new MediaAssetRepository(database);
    const asset = createMediaAsset();
    await repository.add(asset);

    await expect(
      repository.update(asset.id, {
        processingStatus: "failed",
        errorCode: "provider_error",
        updatedAt: "2026-07-24T09:00:00.000Z",
      }),
    ).resolves.toBe(1);
    await expect(repository.getById(asset.id)).resolves.toMatchObject({
      fragmentId: asset.fragmentId,
      processingStatus: "failed",
      errorCode: "provider_error",
    });

    await repository.delete(asset.id);
    await expect(repository.getById(asset.id)).resolves.toBeUndefined();
  });

  it("returns the oldest deterministic asset when legacy data contains duplicates", async () => {
    const repository = new MediaAssetRepository(database);
    const oldest = createMediaAsset({ id: "asset-old", createdAt: "2026-07-24T08:00:00.000Z" });
    const newest = createMediaAsset({ id: "asset-new", createdAt: "2026-07-24T09:00:00.000Z" });
    await database.mediaAssets.bulkAdd([newest, oldest]);

    await expect(repository.getByFragmentId(oldest.fragmentId)).resolves.toEqual(oldest);
  });
});
