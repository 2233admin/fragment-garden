import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  resolveFragmentContentMarkdown,
  type Fragment,
  type FragmentEvent,
  type MediaAsset,
  type MediaAssetKind,
  type Plant,
} from "../domain";
import { MediaAssetRepository } from "../data/repositories/media-asset-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { validateAudioMediaMetadata } from "../validation/media-audio";
import { validateImageMediaMetadata } from "../validation/media-image";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreateMediaFragmentInput = Readonly<{
  kind: MediaAssetKind;
  blob: Blob;
  mimeType: string;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  optionalTitle?: string | null;
  optionalNote?: string | null;
}>;

export type CreateMediaFragmentResult = Readonly<{
  fragment: Fragment;
  plant: Plant;
  mediaAsset: MediaAsset;
  createdEvent: FragmentEvent;
}>;

function formatLocalTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("Media fragment timestamp is invalid");
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function deriveMediaFragmentTitle(kind: MediaAssetKind, timestamp: string): string {
  const label = kind === "image" ? "图片想法" : "语音想法";
  return `${label} · ${formatLocalTimestamp(timestamp)}`;
}

function normalizeOptionalTitle(title: string | null | undefined): string | null {
  const normalized = title?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function normalizeOptionalNote(note: string | null | undefined): string | null {
  return note === null || note === undefined || note.trim().length === 0 ? null : note;
}

function normalizeFileName(fileName: string | null | undefined): string | null {
  const normalized = fileName?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function validateMediaInput(input: CreateMediaFragmentInput): void {
  if (!(input.blob instanceof Blob)) {
    throw new Error("Media blob is required");
  }

  if (input.blob.size <= 0) {
    throw new Error("Media blob cannot be empty");
  }

  if (
    input.durationMs !== undefined &&
    input.durationMs !== null &&
    (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0)
  ) {
    throw new Error("Media duration must be a non-negative integer");
  }

  if (input.kind === "image") {
    validateImageMediaMetadata({
      mimeType: input.mimeType,
      sizeBytes: input.blob.size,
      width: input.width,
      height: input.height,
    });
    return;
  }

  if (input.mimeType.trim().length === 0) {
    throw new Error("Media MIME type is required");
  }

  validateAudioMediaMetadata({
    durationMs: input.durationMs,
    mimeType: input.mimeType,
    sizeBytes: input.blob.size,
  });

  if (input.width !== undefined && input.width !== null) {
    throw new Error("Audio media cannot have image width metadata");
  }

  if (input.height !== undefined && input.height !== null) {
    throw new Error("Audio media cannot have image height metadata");
  }
}

export async function createMediaFragment(
  input: CreateMediaFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<CreateMediaFragmentResult> {
  validateMediaInput(input);

  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const manualTitle = normalizeOptionalTitle(input.optionalTitle);
  const temporaryTitle =
    manualTitle === null ? deriveMediaFragmentTitle(input.kind, timestamp) : null;
  const title = manualTitle ?? temporaryTitle ?? deriveMediaFragmentTitle(input.kind, timestamp);
  const rawText = normalizeOptionalNote(input.optionalNote);
  const fileName = normalizeFileName(input.fileName);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const mediaAssetRepository = new MediaAssetRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.mediaAssets,
    database.fragmentEvents,
    async () => {
      const occupiedSlotIds = (await plantRepository.list()).map((plant) => plant.slotId);
      const fragmentWithoutMarkdown: Omit<Fragment, "contentMarkdown"> = {
        id: createId(),
        contentType: input.kind,
        title,
        rawText,
        sourceUrl: null,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "pending",
        embedding: null,
        parentFragmentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      };
      const fragment: Fragment = {
        ...fragmentWithoutMarkdown,
        contentMarkdown: resolveFragmentContentMarkdown(fragmentWithoutMarkdown),
      };
      const plant: Plant = {
        id: createId(),
        fragmentId: fragment.id,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId: allocateFirstAvailablePlantSlot(PLANT_SLOT_IDS, occupiedSlotIds),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const mediaAsset: MediaAsset = {
        id: createId(),
        fragmentId: fragment.id,
        kind: input.kind,
        blob: input.blob,
        mimeType:
          input.kind === "audio"
            ? validateAudioMediaMetadata({
                durationMs: input.durationMs,
                mimeType: input.mimeType,
                sizeBytes: input.blob.size,
              }).mimeType
            : input.mimeType.trim().toLowerCase(),
        fileName,
        sizeBytes: input.blob.size,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        processingStatus: "pending",
        processingRequestId: null,
        errorCode: null,
        temporaryTitle,
        generatedTitle: null,
        summary: null,
        visibleText: null,
        contentKind: null,
        transcript: null,
        originalTranscript: null,
        transcriptEditedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const createdEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "created",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };

      await fragmentRepository.add(fragment);
      await plantRepository.add(plant);
      await mediaAssetRepository.add(mediaAsset);
      await fragmentEventRepository.add(createdEvent);

      return { fragment, plant, mediaAsset, createdEvent };
    },
  );
}
