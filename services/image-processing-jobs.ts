import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  normalizeContentMarkdown,
  type ContentProcessingJob,
  type Fragment,
  type FragmentEvent,
  type LinkImportInitiator,
  type MediaAsset,
  type Plant,
} from "../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { MediaAssetRepository } from "../data/repositories/media-asset-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { createUuid } from "../domain/shared/id";
import {
  imageAnalysisApiErrorCodeSchema,
  imageAnalysisResultSchema,
  imageClientRequestIdSchema,
  type ImageAnalysisApiErrorCode,
  type ImageAnalysisResult,
} from "../validation/media-image-api";
import { validateImageBlob } from "../validation/media-image";
import { analyzeImageMedia } from "./image-media-api-client";
import { runWithImageProcessingJobLock } from "./image-processing-job-lock";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreateImageProcessingJobInput = Readonly<{
  blob: Blob;
  mimeType: string;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  userTitle?: string | null;
  userNoteMarkdown?: string | null;
  initiator: LinkImportInitiator;
}>;

export type FinalizeImageProcessingJobInput = Readonly<{
  jobId: string;
  clientRequestId: string;
  result: ImageAnalysisResult;
}>;

export type FinalizedImageProcessingJob = Readonly<{
  job: ContentProcessingJob;
  fragment: Fragment;
  plant: Plant;
  mediaAsset: MediaAsset;
  createdEvent: FragmentEvent;
}>;

export type ProcessImageProcessingJobOptions = Readonly<{
  signal?: AbortSignal;
  fetchImplementation?: typeof fetch;
  clientRequestId?: string;
}>;

function optionalTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeErrorCode(errorCode: unknown): ImageAnalysisApiErrorCode {
  const parsed = imageAnalysisApiErrorCodeSchema.safeParse(errorCode);
  return parsed.success ? parsed.data : "provider_error";
}

function requireImageJob(
  job: ContentProcessingJob | undefined,
  jobId: string,
): ContentProcessingJob {
  if (job === undefined || job.kind !== "image") {
    throw new Error(`Image processing job ${jobId} was not found`);
  }
  return job;
}

function combineImageMarkdown(userNoteMarkdown: string | null, generatedMarkdown: string): string {
  const sections = [
    normalizeContentMarkdown(userNoteMarkdown ?? ""),
    normalizeContentMarkdown(generatedMarkdown),
  ].filter((section) => section.length > 0);
  return sections.filter((section, index) => sections.indexOf(section) === index).join("\n\n");
}

export async function createImageProcessingJob(
  input: CreateImageProcessingJobInput,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob> {
  if (!(input.blob instanceof Blob)) {
    throw new Error("Image Blob is required");
  }
  const validated = await validateImageBlob(input.blob);
  if (input.mimeType.trim().toLowerCase() !== validated.mimeType) {
    throw new Error("Image MIME metadata does not match the Blob");
  }
  if (
    (input.width != null && input.width !== validated.width) ||
    (input.height != null && input.height !== validated.height)
  ) {
    throw new Error("Image dimensions do not match the Blob");
  }

  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);
  const userNote = normalizeContentMarkdown(input.userNoteMarkdown ?? "");
  const job: ContentProcessingJob = {
    id: createId(),
    kind: "image",
    status: "pending",
    sourceUrl: null,
    normalizedSourceUrl: null,
    allowDuplicate: false,
    initiator: input.initiator,
    userTitle: optionalTrimmed(input.userTitle),
    userNoteMarkdown: userNote.length === 0 ? null : userNote,
    sourceBlob: input.blob,
    sourceMimeType: validated.mimeType,
    sourceFileName: optionalTrimmed(input.fileName),
    sourceWidth: validated.width,
    sourceHeight: validated.height,
    sourceFragmentId: null,
    sourceSnapshot: null,
    createdFragmentId: null,
    providerTaskId: null,
    processingRequestId: null,
    resultTitle: null,
    resultMarkdown: null,
    errorCode: null,
    errorMessage: null,
    attemptCount: 0,
    attemptGeneration: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    lastPolledAt: null,
  };
  await repository.add(job);
  return job;
}

export async function beginImageProcessingJob(
  jobId: string,
  clientRequestId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob> {
  const requestId = imageClientRequestIdSchema.parse(clientRequestId);
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = requireImageJob(await repository.getById(jobId), jobId);
    if (current.status !== "pending") {
      throw new Error(`Image processing job ${jobId} is not pending`);
    }
    if (current.sourceBlob === null) {
      throw new Error(`Image processing job ${jobId} has no source Blob`);
    }
    const updated: ContentProcessingJob = {
      ...current,
      status: "processing",
      processingRequestId: requestId,
      errorCode: null,
      errorMessage: null,
      attemptCount: current.attemptCount + 1,
      attemptGeneration: current.attemptGeneration + 1,
      startedAt: timestamp,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        status: updated.status,
        processingRequestId: updated.processingRequestId,
        errorCode: null,
        errorMessage: null,
        attemptCount: updated.attemptCount,
        attemptGeneration: updated.attemptGeneration,
        startedAt: updated.startedAt,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return updated;
  });
}

export async function finalizeImageProcessingJob(
  input: FinalizeImageProcessingJobInput,
  dependencies: LocalServiceDependencies = {},
): Promise<FinalizedImageProcessingJob | null> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const jobs = new ContentProcessingJobRepository(database);
  const fragments = new FragmentRepository(database);
  const plants = new PlantRepository(database);
  const assets = new MediaAssetRepository(database);
  const events = new FragmentEventRepository(database);

  return database.transaction(
    "rw",
    database.contentProcessingJobs,
    database.fragments,
    database.plants,
    database.mediaAssets,
    database.fragmentEvents,
    async () => {
      const current = await jobs.getById(input.jobId);
      if (
        current === undefined ||
        current.kind !== "image" ||
        current.status !== "processing" ||
        current.processingRequestId !== input.clientRequestId ||
        current.sourceBlob === null ||
        current.sourceMimeType === null
      ) {
        return null;
      }
      const parsed = imageAnalysisResultSchema.safeParse(input.result);
      if (!parsed.success) {
        throw new Error("Invalid image analysis result");
      }

      const fragmentId = createId();
      const title = current.userTitle ?? parsed.data.title;
      const contentMarkdown = combineImageMarkdown(current.userNoteMarkdown, parsed.data.markdown);
      const fragment: Fragment = {
        id: fragmentId,
        contentType: "image",
        title,
        rawText: null,
        sourceUrl: null,
        contentMarkdown,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "completed",
        embedding: null,
        parentFragmentId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      };
      const occupiedSlotIds = (await plants.list()).map((plant) => plant.slotId);
      const plant: Plant = {
        id: createId(),
        fragmentId,
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
        fragmentId,
        kind: "image",
        blob: current.sourceBlob,
        mimeType: current.sourceMimeType,
        fileName: current.sourceFileName,
        sizeBytes: current.sourceBlob.size,
        width: current.sourceWidth,
        height: current.sourceHeight,
        durationMs: null,
        processingStatus: "completed",
        processingRequestId: null,
        errorCode: null,
        temporaryTitle: null,
        generatedTitle: parsed.data.title,
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
        fragmentId,
        type: "created",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const completedJob: ContentProcessingJob = {
        ...current,
        status: "completed",
        sourceBlob: null,
        createdFragmentId: fragmentId,
        processingRequestId: null,
        resultTitle: parsed.data.title,
        resultMarkdown: parsed.data.markdown,
        errorCode: null,
        errorMessage: null,
        updatedAt: timestamp,
      };

      await fragments.add(fragment);
      await plants.add(plant);
      await assets.add(mediaAsset);
      await events.add(createdEvent);
      requireRecordUpdated(
        await jobs.update(current.id, {
          status: "completed",
          sourceBlob: null,
          createdFragmentId: fragmentId,
          processingRequestId: null,
          resultTitle: parsed.data.title,
          resultMarkdown: parsed.data.markdown,
          errorCode: null,
          errorMessage: null,
          updatedAt: timestamp,
        }),
        "Content processing job",
      );
      return { job: completedJob, fragment, plant, mediaAsset, createdEvent };
    },
  );
}

export async function failImageProcessingJob(
  jobId: string,
  clientRequestId: string,
  errorCode: unknown,
  dependencies: LocalServiceDependencies = {},
): Promise<boolean> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const jobs = new ContentProcessingJobRepository(database);
  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await jobs.getById(jobId);
    if (
      current === undefined ||
      current.kind !== "image" ||
      current.status !== "processing" ||
      current.processingRequestId !== clientRequestId
    ) {
      return false;
    }
    requireRecordUpdated(
      await jobs.update(jobId, {
        status: "failed",
        processingRequestId: null,
        errorCode: normalizeErrorCode(errorCode),
        errorMessage: null,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return true;
  });
}

async function processImageProcessingJobWithoutLock(
  jobId: string,
  options: ProcessImageProcessingJobOptions = {},
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FinalizedImageProcessingJob | null> {
  const clientRequestId = options.clientRequestId ?? createUuid();
  const job = await beginImageProcessingJob(jobId, clientRequestId, { database });
  if (job.sourceBlob === null) {
    throw new Error(`Image processing job ${jobId} has no source Blob`);
  }
  try {
    const response = await analyzeImageMedia(
      job.sourceBlob,
      clientRequestId,
      options.signal,
      options.fetchImplementation,
    );
    if (response.clientRequestId !== clientRequestId) {
      await failImageProcessingJob(jobId, clientRequestId, "invalid_model_response", { database });
      return null;
    }
    return finalizeImageProcessingJob(
      { jobId, clientRequestId, result: response.analysis },
      { database },
    );
  } catch (error) {
    if (options.signal?.aborted === true) {
      await failImageProcessingJob(jobId, clientRequestId, "request_interrupted", { database });
      throw error;
    }
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    await failImageProcessingJob(jobId, clientRequestId, code, { database });
    throw error;
  }
}

export async function processImageProcessingJob(
  jobId: string,
  options: ProcessImageProcessingJobOptions = {},
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FinalizedImageProcessingJob | null> {
  const result = await runWithImageProcessingJobLock(
    jobId,
    { databaseName: database.name, signal: options.signal },
    () => processImageProcessingJobWithoutLock(jobId, options, database),
  );
  return result.acquired ? result.value : null;
}

export async function retryImageProcessingJob(
  jobId: string,
  options: ProcessImageProcessingJobOptions = {},
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FinalizedImageProcessingJob | null> {
  const result = await runWithImageProcessingJobLock(
    jobId,
    { databaseName: database.name, signal: options.signal },
    async () => {
      const jobs = new ContentProcessingJobRepository(database);
      await database.transaction("rw", database.contentProcessingJobs, async () => {
        const current = requireImageJob(await jobs.getById(jobId), jobId);
        if (current.status !== "failed") {
          throw new Error(`Image processing job ${jobId} is not failed`);
        }
        if (current.sourceBlob === null) {
          throw new Error(`Image processing job ${jobId} has no source Blob`);
        }
        requireRecordUpdated(
          await jobs.update(jobId, {
            status: "pending",
            processingRequestId: null,
            resultTitle: null,
            resultMarkdown: null,
            errorCode: null,
            errorMessage: null,
            startedAt: null,
            lastPolledAt: null,
            updatedAt: new Date().toISOString(),
          }),
          "Content processing job",
        );
      });
      return processImageProcessingJobWithoutLock(jobId, options, database);
    },
  );
  return result.acquired ? result.value : null;
}

export async function cancelImageProcessingJob(
  jobId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<boolean> {
  const { database } = resolveLocalServiceDependencies(dependencies);
  const jobs = new ContentProcessingJobRepository(database);
  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await jobs.getById(jobId);
    if (current === undefined || current.kind !== "image" || current.status === "completed") {
      return false;
    }
    await jobs.delete(jobId);
    return true;
  });
}

export async function markStaleImageProcessingJobs(
  olderThan: Date,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<number> {
  if (Number.isNaN(olderThan.valueOf())) {
    throw new Error("Image processing threshold is invalid");
  }
  const jobs = new ContentProcessingJobRepository(database);
  const interrupted = await jobs.listByKindAndStatuses("image", ["processing"]);
  let changed = 0;
  for (const candidate of interrupted) {
    if (new Date(candidate.updatedAt).getTime() >= olderThan.getTime()) continue;
    const lockResult = await runWithImageProcessingJobLock(
      candidate.id,
      { databaseName: database.name, ifAvailable: true },
      () =>
        database.transaction("rw", database.contentProcessingJobs, async () => {
          const current = await jobs.getById(candidate.id);
          if (
            current === undefined ||
            current.kind !== "image" ||
            current.status !== "processing" ||
            current.processingRequestId !== candidate.processingRequestId ||
            new Date(current.updatedAt).getTime() >= olderThan.getTime()
          ) {
            return false;
          }
          requireRecordUpdated(
            await jobs.update(current.id, {
              status: "failed",
              processingRequestId: null,
              errorCode: "request_interrupted",
              errorMessage: null,
              updatedAt: new Date().toISOString(),
            }),
            "Content processing job",
          );
          return true;
        }),
    );
    if (lockResult.acquired && lockResult.value) changed += 1;
  }
  return changed;
}
