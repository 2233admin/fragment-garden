import type { Fragment, MediaAsset } from "../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { MediaAssetRepository } from "../data/repositories/media-asset-repository";
import { createUuid } from "../domain/shared/id";
import {
  imageAnalysisApiErrorCodeSchema,
  imageAnalysisResultSchema,
  type ImageAnalysisApiErrorCode,
  type ImageAnalysisResult,
} from "../validation/media-image-api";
import { analyzeImageMedia } from "./image-media-api-client";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
  requireRecordUpdated,
} from "./local-service-dependencies";

export type ImageProcessingResult = Readonly<{
  asset: MediaAsset;
  fragment: Fragment;
}>;

function nowDependencies(database: FragmentGardenDatabase, now: Date): LocalServiceDependencies {
  return { database, now: () => now };
}

function normalizeImageErrorCode(errorCode: unknown): ImageAnalysisApiErrorCode {
  const parsed = imageAnalysisApiErrorCodeSchema.safeParse(errorCode);
  return parsed.success ? parsed.data : "provider_error";
}

export async function setImageLocalOnly(
  assetId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<void> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);
  await database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await repository.getById(assetId);
    if (asset === undefined || asset.kind !== "image") return;
    await repository.update(asset.id, {
      processingStatus: "local_only",
      processingRequestId: null,
      errorCode: null,
      updatedAt: timestamp,
    });
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment !== undefined && fragment.analysisStatus !== "not_required") {
      await fragments.update(fragment.id, { analysisStatus: "not_required", updatedAt: timestamp });
    }
  });
}

export async function beginImageAnalysis(
  assetId: string,
  clientRequestId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<MediaAsset> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);
  return database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await repository.getById(assetId);
    if (asset === undefined || asset.kind !== "image") {
      throw new Error("Image media was not found");
    }
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") {
      throw new Error("Deleted image media cannot be processed");
    }
    if (asset.processingStatus === "processing") {
      throw new Error("Image media is already being processed");
    }
    const updated: MediaAsset = {
      ...asset,
      processingStatus: "processing",
      processingRequestId: clientRequestId,
      errorCode: null,
      updatedAt: timestamp,
    };
    await repository.put(updated);
    return updated;
  });
}

export async function applyImageAnalysisResult(
  input: Readonly<{
    assetId: string;
    clientRequestId: string;
    result: ImageAnalysisResult;
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ImageProcessingResult | null> {
  const parsed = imageAnalysisResultSchema.safeParse(input.result);
  if (!parsed.success) throw new Error("Invalid image analysis result");
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);

  return database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await assets.getById(input.assetId);
    if (asset === undefined || asset.kind !== "image") return null;
    if (asset.processingRequestId !== input.clientRequestId) return null;
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") return null;

    const updatedAsset: MediaAsset = {
      ...asset,
      processingStatus: "completed",
      processingRequestId: null,
      errorCode: null,
      generatedTitle: parsed.data.title,
      summary: parsed.data.summary,
      visibleText: parsed.data.visibleText,
      contentKind: parsed.data.contentKind,
      updatedAt: timestamp,
    };
    await assets.put(updatedAsset);
    const shouldUpdateTitle =
      asset.temporaryTitle !== null && fragment.title === asset.temporaryTitle;
    const updatedFragment: Fragment = {
      ...fragment,
      analysisStatus: "completed",
      ...(shouldUpdateTitle ? { title: parsed.data.title } : {}),
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await fragments.update(fragment.id, {
        analysisStatus: "completed",
        ...(shouldUpdateTitle ? { title: parsed.data.title } : {}),
        updatedAt: timestamp,
      }),
      "Fragment",
    );
    return { asset: updatedAsset, fragment: updatedFragment };
  });
}

export async function markImageAnalysisFailed(
  assetId: string,
  clientRequestId: string,
  errorCode: unknown,
  dependencies: LocalServiceDependencies = {},
): Promise<boolean> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);
  return database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await assets.getById(assetId);
    if (
      asset === undefined ||
      asset.kind !== "image" ||
      asset.processingRequestId !== clientRequestId
    ) {
      return false;
    }
    // A request can finish after the user soft-deletes its Fragment. Do not
    // mutate even the processing state in that case; the late response must
    // not write anything back to deleted content.
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") {
      return false;
    }
    await assets.update(asset.id, {
      processingStatus: "failed",
      processingRequestId: null,
      errorCode: normalizeImageErrorCode(errorCode),
      updatedAt: timestamp,
    });
    await fragments.update(fragment.id, { analysisStatus: "failed", updatedAt: timestamp });
    return true;
  });
}

export async function processImageAnalysis(
  assetId: string,
  options: Readonly<{
    signal?: AbortSignal;
    fetchImplementation?: typeof fetch;
    clientRequestId?: string;
  }> = {},
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<ImageProcessingResult | null> {
  const clientRequestId = options.clientRequestId ?? createUuid();
  const asset = await beginImageAnalysis(assetId, clientRequestId, { database });
  try {
    const response = await analyzeImageMedia(
      asset.blob,
      clientRequestId,
      options.signal,
      options.fetchImplementation,
    );
    if (response.clientRequestId !== clientRequestId) {
      await markImageAnalysisFailed(assetId, clientRequestId, "invalid_model_response", {
        database,
      });
      return null;
    }
    return applyImageAnalysisResult(
      { assetId, clientRequestId, result: response.analysis },
      { database },
    );
  } catch (error) {
    if (options.signal?.aborted === true) throw error;
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    await markImageAnalysisFailed(assetId, clientRequestId, code, { database });
    throw error;
  }
}

export async function markStaleImageProcessing(
  olderThan: Date,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<number> {
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);
  const stale = await assets.listByProcessingStatuses(["processing"]);
  let changed = 0;
  for (const asset of stale) {
    if (new Date(asset.updatedAt).getTime() >= olderThan.getTime()) continue;
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") {
      const didUpdate = await database.transaction("rw", database.mediaAssets, async () => {
        const current = await assets.getById(asset.id);
        if (
          current === undefined ||
          current.kind !== "image" ||
          current.processingStatus !== "processing" ||
          current.processingRequestId !== asset.processingRequestId
        ) {
          return false;
        }
        await assets.update(current.id, {
          processingStatus: "failed",
          processingRequestId: null,
          errorCode: "request_interrupted",
          updatedAt: olderThan.toISOString(),
        });
        return true;
      });
      if (didUpdate) changed += 1;
      continue;
    }
    if (
      await markImageAnalysisFailed(
        asset.id,
        asset.processingRequestId ?? "__stale__",
        "request_interrupted",
        nowDependencies(database, olderThan),
      )
    ) {
      changed += 1;
    }
  }
  return changed;
}
