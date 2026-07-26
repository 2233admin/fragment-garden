import {
  normalizeContentMarkdown,
  resolveFragmentContentMarkdown,
  type Fragment,
  type MediaAsset,
} from "../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { MediaAssetRepository } from "../data/repositories/media-asset-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { createUuid } from "../domain/shared/id";
import { parseRestoredEventPayload } from "../validation/fragment-event-payload";
import {
  AudioMediaValidationError,
  deriveAudioTitleFromTranscript,
  normalizeAudioTranscript,
} from "../validation/media-audio";
import {
  audioTranscriptionApiErrorCodeSchema,
  type AudioTranscriptionApiErrorCode,
  type AudioTranscriptionApiResult,
} from "../validation/media-audio-api";
import { transcribeAudioMedia } from "./audio-media-api-client";
import {
  type LocalServiceDependencies,
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AudioProcessingResult = Readonly<{
  asset: MediaAsset;
  fragment: Fragment;
}>;

function canReplaceGeneratedContent(fragment: Fragment, mediaAsset: MediaAsset): boolean {
  const current = normalizeContentMarkdown(fragment.contentMarkdown ?? "");
  const expected = resolveFragmentContentMarkdown(
    { ...fragment, contentMarkdown: undefined },
    null,
    mediaAsset,
  );
  return current.length === 0 || current === expected;
}

function normalizeAudioErrorCode(errorCode: unknown): AudioTranscriptionApiErrorCode {
  const parsed = audioTranscriptionApiErrorCodeSchema.safeParse(errorCode);
  return parsed.success ? parsed.data : "provider_error";
}

function resolveErrorCode(error: unknown): AudioTranscriptionApiErrorCode {
  if (error instanceof AudioMediaValidationError) {
    return normalizeAudioErrorCode(error.code);
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return normalizeAudioErrorCode(code);
  }
  return "provider_error";
}

export async function setAudioLocalOnly(
  assetId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<void> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);

  await database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await assets.getById(assetId);
    if (asset === undefined || asset.kind !== "audio") return;

    await assets.update(asset.id, {
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

export async function beginAudioTranscription(
  assetId: string,
  clientRequestId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<MediaAsset> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);

  return database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await assets.getById(assetId);
    if (asset === undefined || asset.kind !== "audio") {
      throw new Error("Audio media was not found");
    }
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") {
      throw new Error("Deleted audio media cannot be processed");
    }
    if (asset.processingStatus === "processing") {
      throw new Error("Audio media is already being processed");
    }

    const updated: MediaAsset = {
      ...asset,
      processingStatus: "processing",
      processingRequestId: clientRequestId,
      errorCode: null,
      updatedAt: timestamp,
    };
    await assets.put(updated);
    return updated;
  });
}

export async function applyAudioTranscriptionResult(
  input: Readonly<{
    assetId: string;
    clientRequestId: string;
    transcript: string;
    /** Set only after the user confirms replacing an edited transcript. */
    replaceEditedTranscript?: boolean;
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<AudioProcessingResult | null> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);

  return database.transaction("rw", database.mediaAssets, database.fragments, async () => {
    const asset = await assets.getById(input.assetId);
    if (asset === undefined || asset.kind !== "audio") return null;
    if (asset.processingRequestId !== input.clientRequestId) return null;

    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") return null;

    const transcript = normalizeAudioTranscript(input.transcript);

    const shouldReplaceEditedTranscript =
      asset.transcriptEditedAt === null || input.replaceEditedTranscript === true;
    const visibleTranscript = shouldReplaceEditedTranscript ? transcript : asset.transcript;
    const generatedTitle = deriveAudioTitleFromTranscript(transcript);
    const updatedAsset: MediaAsset = {
      ...asset,
      processingStatus: "completed",
      processingRequestId: null,
      errorCode: null,
      generatedTitle,
      transcript: visibleTranscript,
      originalTranscript: transcript,
      transcriptEditedAt: shouldReplaceEditedTranscript ? null : asset.transcriptEditedAt,
      updatedAt: timestamp,
    };
    await assets.put(updatedAsset);

    const shouldUpdateTitle =
      generatedTitle !== null &&
      asset.temporaryTitle !== null &&
      fragment.title === asset.temporaryTitle;
    const shouldUpdateContent = canReplaceGeneratedContent(fragment, asset);
    const contentMarkdown = resolveFragmentContentMarkdown(
      { ...fragment, contentMarkdown: undefined },
      null,
      updatedAsset,
    );
    const updatedFragment: Fragment = {
      ...fragment,
      analysisStatus: "completed",
      ...(shouldUpdateTitle ? { title: generatedTitle } : {}),
      ...(shouldUpdateContent ? { contentMarkdown } : {}),
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await fragments.update(fragment.id, {
        analysisStatus: "completed",
        ...(shouldUpdateTitle ? { title: generatedTitle } : {}),
        ...(shouldUpdateContent ? { contentMarkdown } : {}),
        updatedAt: timestamp,
      }),
      "Fragment",
    );

    return { asset: updatedAsset, fragment: updatedFragment };
  });
}

export async function markAudioTranscriptionFailed(
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
      asset.kind !== "audio" ||
      asset.processingRequestId !== clientRequestId
    ) {
      return false;
    }
    const fragment = await fragments.getById(asset.fragmentId);
    if (fragment === undefined || fragment.lifecycleStatus === "deleted") {
      return false;
    }

    await assets.update(asset.id, {
      processingStatus: "failed",
      processingRequestId: null,
      errorCode: normalizeAudioErrorCode(errorCode),
      updatedAt: timestamp,
    });
    if (fragment.analysisStatus !== "failed") {
      await fragments.update(fragment.id, { analysisStatus: "failed", updatedAt: timestamp });
    }
    return true;
  });
}

export async function processAudioTranscription(
  assetId: string,
  options: Readonly<{
    signal?: AbortSignal;
    fetchImplementation?: typeof fetch;
    clientRequestId?: string;
    replaceEditedTranscript?: boolean;
  }> = {},
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<AudioProcessingResult | null> {
  const clientRequestId = options.clientRequestId ?? createUuid();
  const asset = await beginAudioTranscription(assetId, clientRequestId, { database });

  try {
    const response: AudioTranscriptionApiResult = await transcribeAudioMedia(
      asset.blob,
      clientRequestId,
      options.signal,
      options.fetchImplementation,
    );
    if (response.clientRequestId !== clientRequestId) {
      await markAudioTranscriptionFailed(assetId, clientRequestId, "invalid_transcription", {
        database,
      });
      return null;
    }
    return applyAudioTranscriptionResult(
      {
        assetId,
        clientRequestId,
        replaceEditedTranscript: options.replaceEditedTranscript,
        transcript: response.transcription.transcript,
      },
      { database },
    );
  } catch (error) {
    if (options.signal?.aborted === true) throw error;
    await markAudioTranscriptionFailed(assetId, clientRequestId, resolveErrorCode(error), {
      database,
    });
    throw error;
  }
}

export async function updateAudioTranscript(
  input: Readonly<{ assetId: string; transcript: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<MediaAsset | null> {
  const transcript = normalizeAudioTranscript(input.transcript);
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const assets = new MediaAssetRepository(database);
  const fragments = new FragmentRepository(database);
  const plants = new PlantRepository(database);
  const events = new FragmentEventRepository(database);
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });

  return database.transaction(
    "rw",
    [database.mediaAssets, database.fragments, database.plants, database.fragmentEvents],
    async () => {
      const asset = await assets.getById(input.assetId);
      if (asset === undefined || asset.kind !== "audio") return null;
      const [fragment, plant] = await Promise.all([
        fragments.getById(asset.fragmentId),
        plants.getByFragmentId(asset.fragmentId),
      ]);
      if (fragment === undefined || fragment.lifecycleStatus === "deleted" || plant === undefined) {
        return null;
      }

      const wasDormant = fragment.lifecycleStatus === "dormant";
      const isArchived = fragment.lifecycleStatus === "archived";
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: isArchived ? "archived" : "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant = {
        ...plant,
        stage: fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage,
        vitality: "active" as const,
        slotId: isArchived ? null : plant.slotId,
        updatedAt: timestamp,
      };
      const restoredEvent = wasDormant
        ? {
            id: createId(),
            fragmentId: fragment.id,
            type: "restored" as const,
            payload: restoredPayload,
            occurredAt: timestamp,
            ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
          }
        : null;
      const updated: MediaAsset = {
        ...asset,
        transcript,
        transcriptEditedAt: timestamp,
        updatedAt: timestamp,
      };
      const shouldUpdateContent = canReplaceGeneratedContent(fragment, asset);
      const contentMarkdown = resolveFragmentContentMarkdown(
        { ...fragment, contentMarkdown: undefined },
        null,
        updated,
      );

      await assets.put(updated);
      requireRecordUpdated(
        await fragments.update(fragment.id, {
          lifecycleStatus: updatedFragment.lifecycleStatus,
          ...(shouldUpdateContent ? { contentMarkdown } : {}),
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plants.update(plant.id, {
          stage: updatedPlant.stage,
          vitality: updatedPlant.vitality,
          slotId: updatedPlant.slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      if (restoredEvent !== null) {
        await events.add(restoredEvent);
      }
      return updated;
    },
  );
}

export async function markStaleAudioProcessing(
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
          current.kind !== "audio" ||
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
      await markAudioTranscriptionFailed(
        asset.id,
        asset.processingRequestId ?? "__stale__",
        "request_interrupted",
        { database, now: () => olderThan },
      )
    ) {
      changed += 1;
    }
  }
  return changed;
}
