import { z } from "zod";

import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  buildSproutGenerateContext,
  markdownToPlainText,
  normalizeContentMarkdown,
  plainTextToMarkdown,
  type ContentProcessingJob,
  type Fragment,
  type FragmentEvent,
  type FragmentRelation,
  type Plant,
} from "../domain";
import { getFragmentDetailViewModel } from "../data/queries/fragment-detail-query";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRelationRepository } from "../data/repositories/fragment-relation-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  sproutGenerateRequestSchema,
  sproutGeneratedNoteSchema,
  type SproutGenerateRequest,
} from "../validation/sprout-generate-api";
import { parseRestoredEventPayload } from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";
import {
  SproutGenerationApiClient,
  SproutGenerationApiClientError,
  sproutGenerationErrorMessage,
} from "./sprout-generation-api-client";

const ACTIVE_SPROUT_JOB_STATUSES = new Set<ContentProcessingJob["status"]>([
  "pending",
  "processing",
  "awaiting_confirmation",
  "failed",
]);

const sproutJobSnapshotSchema = z
  .object({
    request: sproutGenerateRequestSchema,
    sourceUpdatedAt: z.string().min(1),
  })
  .strict();

type SproutJobSnapshot = z.infer<typeof sproutJobSnapshotSchema>;

export type CreateSproutGenerationJobResult = Readonly<{
  job: ContentProcessingJob;
  kind: "created" | "existing";
}>;

export type ConfirmSproutGenerationResult = Readonly<{
  created: boolean;
  fragmentId: string;
}>;

function resolveSourceName(fragment: Fragment, mediaFileName: string | null): string | null {
  if (fragment.contentType === "link" && fragment.sourceUrl !== null) {
    try {
      return new URL(fragment.sourceUrl).hostname.replace(/^www\./u, "");
    } catch {
      return "原链接";
    }
  }
  return fragment.contentType === "image" || fragment.contentType === "audio"
    ? mediaFileName
    : null;
}

function resolveSourceMarkdown(
  fragment: Fragment,
  resolvedMarkdown: string,
  transcript: string | null,
): string {
  if (fragment.contentType === "audio") {
    return plainTextToMarkdown(transcript ?? "");
  }
  return resolvedMarkdown;
}

function serializeSnapshot(snapshot: SproutJobSnapshot): string {
  return JSON.stringify(sproutJobSnapshotSchema.parse(snapshot));
}

export function parseSproutJobSnapshot(job: ContentProcessingJob): SproutJobSnapshot {
  if (job.kind !== "sprout" || job.sourceSnapshot === null) {
    throw new Error("Sprout job snapshot is missing");
  }
  try {
    return sproutJobSnapshotSchema.parse(JSON.parse(job.sourceSnapshot));
  } catch (error) {
    throw new Error("Sprout job snapshot is invalid", { cause: error });
  }
}

function latestActiveSproutJob(jobs: readonly ContentProcessingJob[]): ContentProcessingJob | null {
  return (
    [...jobs]
      .reverse()
      .find((job) => job.kind === "sprout" && ACTIVE_SPROUT_JOB_STATUSES.has(job.status)) ?? null
  );
}

export async function findActiveSproutGenerationJob(
  sourceFragmentId: string,
  dependencies: Pick<LocalServiceDependencies, "database"> = {},
): Promise<ContentProcessingJob | null> {
  const database = dependencies.database ?? resolveLocalServiceDependencies({}).database;
  const jobs = await new ContentProcessingJobRepository(database).listBySourceFragmentId(
    sourceFragmentId,
  );
  return latestActiveSproutJob(jobs);
}

export async function createSproutGenerationJob(
  sourceFragmentId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<CreateSproutGenerationJobResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const detail = await getFragmentDetailViewModel(sourceFragmentId, database);
  if (detail === undefined || detail.fragment.lifecycleStatus === "deleted") {
    throw new Error("Source fragment was not found");
  }

  const request = buildSproutGenerateContext({
    id: detail.fragment.id,
    title: detail.fragment.title,
    contentMarkdown: resolveSourceMarkdown(
      detail.fragment,
      detail.contentMarkdown,
      detail.mediaAsset?.kind === "audio" ? detail.mediaAsset.transcript : null,
    ),
    notes: detail.notes,
    sourceType: detail.fragment.contentType === "audio" ? "voice" : detail.fragment.contentType,
    sourceName: resolveSourceName(detail.fragment, detail.mediaAsset?.fileName ?? null),
    existingSproutTitles: detail.childFragments.map((fragment) => fragment.title),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction(
    "rw",
    database.contentProcessingJobs,
    database.fragments,
    async () => {
      const source = await database.fragments.get(sourceFragmentId);
      if (source === undefined || source.lifecycleStatus === "deleted") {
        throw new Error("Source fragment was not found");
      }
      const existing = latestActiveSproutJob(
        await repository.listBySourceFragmentId(sourceFragmentId),
      );
      if (existing !== null) return { job: existing, kind: "existing" };

      const job: ContentProcessingJob = {
        id: createId(),
        kind: "sprout",
        status: "pending",
        sourceUrl: null,
        normalizedSourceUrl: null,
        allowDuplicate: false,
        initiator: null,
        userTitle: null,
        userNoteMarkdown: null,
        sourceBlob: null,
        sourceMimeType: null,
        sourceFileName: null,
        sourceWidth: null,
        sourceHeight: null,
        sourceFragmentId,
        sourceSnapshot: serializeSnapshot({ request, sourceUpdatedAt: source.updatedAt }),
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
      return { job, kind: "created" };
    },
  );
}

async function beginSproutRequest(
  jobId: string,
  dependencies: LocalServiceDependencies,
): Promise<Readonly<{ job: ContentProcessingJob; request: SproutGenerateRequest }> | null> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const job = await repository.getById(jobId);
    if (job?.kind !== "sprout" || (job.status !== "pending" && job.status !== "failed")) {
      return null;
    }
    const snapshot = parseSproutJobSnapshot(job);
    const requestId = createId();
    const attemptCount = job.attemptCount + 1;
    const changes = {
      status: "processing" as const,
      processingRequestId: requestId,
      errorCode: null,
      errorMessage: null,
      attemptCount,
      attemptGeneration: attemptCount,
      startedAt: timestamp,
      updatedAt: timestamp,
    };
    requireRecordUpdated(await repository.update(jobId, changes), "Content processing job");
    return { job: { ...job, ...changes }, request: snapshot.request };
  });
}

export async function processSproutGenerationJob(
  jobId: string,
  options: Readonly<{
    apiClient?: SproutGenerationApiClient;
    signal?: AbortSignal;
    dependencies?: LocalServiceDependencies;
  }> = {},
): Promise<ContentProcessingJob | null> {
  const dependencies = options.dependencies ?? {};
  const started = await beginSproutRequest(jobId, dependencies);
  if (started === null) return null;
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);
  const requestId = started.job.processingRequestId as string;

  try {
    const result = await (options.apiClient ?? new SproutGenerationApiClient()).generate(
      started.request,
      options.signal,
    );
    return database.transaction(
      "rw",
      database.contentProcessingJobs,
      database.fragments,
      async () => {
        const [job, source] = await Promise.all([
          repository.getById(jobId),
          database.fragments.get(started.job.sourceFragmentId as string),
        ]);
        if (
          job?.kind !== "sprout" ||
          job.status !== "processing" ||
          job.processingRequestId !== requestId
        ) {
          return null;
        }
        if (source === undefined || source.lifecycleStatus === "deleted") {
          const missingChanges = {
            status: "failed" as const,
            processingRequestId: null,
            errorCode: "source_missing",
            errorMessage: "源笔记已经不存在，没有创建新内容。",
            updatedAt: timestamp,
          };
          await repository.update(jobId, missingChanges);
          return { ...job, ...missingChanges };
        }
        const validatedResult = sproutGeneratedNoteSchema.parse(result);
        const changes = {
          status: "awaiting_confirmation" as const,
          processingRequestId: null,
          resultTitle: validatedResult.title,
          resultMarkdown: validatedResult.markdown,
          errorCode: null,
          errorMessage: null,
          updatedAt: timestamp,
        };
        requireRecordUpdated(await repository.update(jobId, changes), "Content processing job");
        return { ...job, ...changes };
      },
    );
  } catch (error) {
    const code = error instanceof SproutGenerationApiClientError ? error.code : "provider_error";
    return database.transaction("rw", database.contentProcessingJobs, async () => {
      const job = await repository.getById(jobId);
      if (
        job?.kind !== "sprout" ||
        job.status !== "processing" ||
        job.processingRequestId !== requestId
      ) {
        return null;
      }
      const changes = {
        status: "failed" as const,
        processingRequestId: null,
        errorCode: code,
        errorMessage: sproutGenerationErrorMessage(code),
        updatedAt: timestamp,
      };
      requireRecordUpdated(await repository.update(jobId, changes), "Content processing job");
      return { ...job, ...changes };
    });
  }
}

export async function cancelSproutGenerationJob(
  jobId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<void> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);
  await database.transaction("rw", database.contentProcessingJobs, async () => {
    const job = await repository.getById(jobId);
    if (job?.kind !== "sprout" || job.status === "completed" || job.status === "cancelled") {
      return;
    }
    await repository.update(jobId, {
      status: "cancelled",
      processingRequestId: null,
      updatedAt: timestamp,
    });
  });
}

export async function markStaleSproutGenerationJobs(
  staleBefore: Date,
  dependencies: LocalServiceDependencies = {},
): Promise<number> {
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);
  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const jobs = await repository.listByKindAndStatuses("sprout", ["processing"]);
    let updatedCount = 0;
    for (const job of jobs) {
      if (Date.parse(job.updatedAt) > staleBefore.getTime()) continue;
      updatedCount += await repository.update(job.id, {
        status: "failed",
        processingRequestId: null,
        errorCode: "request_timeout",
        errorMessage: "上次发芽没有完成，没有创建新笔记，可以重新试一次。",
        updatedAt: timestamp,
      });
    }
    return updatedCount;
  });
}

export async function confirmSproutGeneration(
  input: Readonly<{ jobId: string; title: string; markdown: string; now?: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ConfirmSproutGenerationResult> {
  const preview = sproutGeneratedNoteSchema.parse({
    title: input.title.trim(),
    markdown: normalizeContentMarkdown(input.markdown),
  });
  const resolvedDependencies =
    input.now === undefined
      ? dependencies
      : { ...dependencies, now: () => new Date(input.now as string) };
  const { database, createId, timestamp } = resolveLocalServiceDependencies(resolvedDependencies);
  const jobRepository = new ContentProcessingJobRepository(database);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const eventRepository = new FragmentEventRepository(database);
  const relationRepository = new FragmentRelationRepository(database);

  return database.transaction(
    "rw",
    database.contentProcessingJobs,
    database.fragments,
    database.plants,
    database.fragmentEvents,
    database.relations,
    async () => {
      const job = await jobRepository.getById(input.jobId);
      if (job?.kind !== "sprout") throw new Error("Sprout job was not found");
      if (job.status === "completed" && job.createdFragmentId !== null) {
        const existing = await fragmentRepository.getById(job.createdFragmentId);
        if (existing === undefined) throw new Error("Created sprout fragment was not found");
        return { created: false, fragmentId: existing.id };
      }
      if (job.status !== "awaiting_confirmation" || job.createdFragmentId !== null) {
        throw new Error("Sprout job is not awaiting confirmation");
      }

      const snapshot = parseSproutJobSnapshot(job);
      const [source, sourcePlant, plants] = await Promise.all([
        fragmentRepository.getById(snapshot.request.source.id),
        plantRepository.getByFragmentId(snapshot.request.source.id),
        plantRepository.list(),
      ]);
      if (source === undefined || source.lifecycleStatus === "deleted") {
        throw new Error("Source fragment no longer exists");
      }
      if (sourcePlant === undefined) throw new Error("Source plant was not found");

      const fragmentId = createId();
      const fragment: Fragment = {
        id: fragmentId,
        contentType: "text",
        title: preview.title,
        rawText: markdownToPlainText(preview.markdown),
        sourceUrl: null,
        contentMarkdown: preview.markdown,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: "not_required",
        embedding: null,
        parentFragmentId: source.id,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
        completedAt: null,
      };
      const plant: Plant = {
        id: createId(),
        fragmentId,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId: allocateFirstAvailablePlantSlot(
          PLANT_SLOT_IDS,
          plants.flatMap((candidate) => (candidate.slotId === null ? [] : [candidate.slotId])),
        ),
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
      const relation: FragmentRelation = {
        id: createId(),
        sourceFragmentId: fragmentId,
        targetFragmentId: source.id,
        relationType: "grows_from",
        status: "confirmed",
        similarityScore: null,
        explanation: null,
        createdAt: timestamp,
        confirmedAt: timestamp,
      };

      await fragmentRepository.add(fragment);
      await plantRepository.add(plant);
      await eventRepository.add(createdEvent);
      await relationRepository.add(relation);

      const wasDormant = source.lifecycleStatus === "dormant";
      const sourceLifecycleStatus =
        source.lifecycleStatus === "archived" ? "archived" : ("active" as const);
      requireRecordUpdated(
        await fragmentRepository.update(source.id, {
          lifecycleStatus: sourceLifecycleStatus,
          lastInteractedAt: timestamp,
          updatedAt: timestamp,
        }),
        "Source fragment",
      );
      if (wasDormant) {
        requireRecordUpdated(
          await plantRepository.update(sourcePlant.id, {
            vitality: "active",
            updatedAt: timestamp,
          }),
          "Source plant",
        );
        await eventRepository.add({
          id: createId(),
          fragmentId: source.id,
          type: "restored",
          payload: parseRestoredEventPayload({ reason: "viewed" }),
          occurredAt: timestamp,
          ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
        });
      }

      requireRecordUpdated(
        await jobRepository.update(job.id, {
          status: "completed",
          createdFragmentId: fragmentId,
          resultTitle: preview.title,
          resultMarkdown: preview.markdown,
          updatedAt: timestamp,
        }),
        "Content processing job",
      );
      return { created: true, fragmentId };
    },
  );
}
