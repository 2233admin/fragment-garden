import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  buildLinkNoteMarkdown,
  normalizeExternalUrl,
  type ContentProcessingJob,
  type ExternalLinkImport,
  type Fragment,
  type FragmentEvent,
  type Plant,
} from "../domain";
import { findExistingExternalLinkImport } from "../data/queries/external-link-import-query";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";
import {
  matchesLinkProcessingJobAttempt,
  type LinkProcessingJobAttemptIdentity,
} from "./link-processing-job-state";

export type CompleteLinkProcessingJobInput = Readonly<{
  jobId: string;
  externalNoteId: string;
  title: string;
  summary: string;
  sourceContent: string;
  canonicalUrl: string;
  truncated: boolean;
  requestId: string | null;
  attempt: LinkProcessingJobAttemptIdentity;
  now: string;
}>;

export type FailLinkProcessingJobInput = Readonly<{
  jobId: string;
  errorCode: string;
  errorMessage: string;
  requestId: string | null;
  attempt?: LinkProcessingJobAttemptIdentity;
  now: string;
}>;

export type FinalizeLinkProcessingJobResult = Readonly<{
  didFinalize: boolean;
  didCreateFragment: boolean;
  job: ContentProcessingJob;
  fragment: Fragment | null;
  plant: Plant | null;
  createdEvent: FragmentEvent | null;
  externalLinkImport: ExternalLinkImport | null;
}>;

export type FailLinkProcessingJobResult = Readonly<{
  didFinalize: boolean;
  job: ContentProcessingJob;
}>;

function isTerminalJob(job: ContentProcessingJob): boolean {
  return job.status === "completed" || job.status === "cancelled" || job.status === "failed";
}

async function readCompletedResult(
  job: ContentProcessingJob,
  repositories: Readonly<{
    fragments: FragmentRepository;
    plants: PlantRepository;
    externalLinkImports: ExternalLinkImportRepository;
  }>,
): Promise<FinalizeLinkProcessingJobResult> {
  if (job.createdFragmentId === null) {
    return {
      didFinalize: false,
      didCreateFragment: false,
      job,
      fragment: null,
      plant: null,
      createdEvent: null,
      externalLinkImport: null,
    };
  }

  const [fragment, plant, externalLinkImport] = await Promise.all([
    repositories.fragments.getById(job.createdFragmentId),
    repositories.plants.getByFragmentId(job.createdFragmentId),
    repositories.externalLinkImports.getByFragmentId(job.createdFragmentId),
  ]);
  return {
    didFinalize: false,
    didCreateFragment: false,
    job,
    fragment: fragment ?? null,
    plant: plant ?? null,
    createdEvent: null,
    externalLinkImport: externalLinkImport ?? null,
  };
}

export async function completeLinkProcessingJob(
  input: CompleteLinkProcessingJobInput,
  dependencies: LocalServiceDependencies = {},
): Promise<FinalizeLinkProcessingJobResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const jobs = new ContentProcessingJobRepository(database);
  const fragments = new FragmentRepository(database);
  const plants = new PlantRepository(database);
  const events = new FragmentEventRepository(database);
  const externalLinkImports = new ExternalLinkImportRepository(database);

  return database.transaction(
    "rw",
    database.contentProcessingJobs,
    database.fragments,
    database.plants,
    database.fragmentEvents,
    database.externalLinkImports,
    async () => {
      const current = await jobs.getById(input.jobId);
      if (current === undefined || current.kind !== "link") {
        throw new Error(`Link processing job ${input.jobId} was not found`);
      }
      if (current.status === "completed") {
        return readCompletedResult(current, { fragments, plants, externalLinkImports });
      }
      if (
        isTerminalJob(current) ||
        !matchesLinkProcessingJobAttempt(current, input.attempt) ||
        (current.status !== "pending" && current.status !== "processing")
      ) {
        return {
          didFinalize: false,
          didCreateFragment: false,
          job: current,
          fragment: null,
          plant: null,
          createdEvent: null,
          externalLinkImport: null,
        };
      }
      if (current.sourceUrl === null) {
        throw new Error(`Link processing job ${input.jobId} has no source URL`);
      }

      const normalizedSourceUrl =
        current.normalizedSourceUrl ?? normalizeExternalUrl(current.sourceUrl);
      if (!current.allowDuplicate) {
        const existing = await findExistingExternalLinkImport(normalizedSourceUrl, database);
        if (existing !== null) {
          const completedJob: ContentProcessingJob = {
            ...current,
            status: "completed",
            createdFragmentId: existing.fragment.id,
            processingRequestId: input.requestId ?? current.processingRequestId,
            resultTitle: existing.fragment.title,
            resultMarkdown: existing.fragment.contentMarkdown,
            errorCode: null,
            errorMessage: null,
            updatedAt: timestamp,
          };
          requireRecordUpdated(
            await jobs.update(current.id, {
              status: "completed",
              createdFragmentId: completedJob.createdFragmentId,
              processingRequestId: completedJob.processingRequestId,
              resultTitle: completedJob.resultTitle,
              resultMarkdown: completedJob.resultMarkdown,
              errorCode: null,
              errorMessage: null,
              updatedAt: timestamp,
            }),
            "Content processing job",
          );
          return {
            didFinalize: true,
            didCreateFragment: false,
            job: completedJob,
            fragment: existing.fragment,
            plant: (await plants.getByFragmentId(existing.fragment.id)) ?? null,
            createdEvent: null,
            externalLinkImport: existing.externalLinkImport,
          };
        }
      }

      const built = buildLinkNoteMarkdown({
        sourceUrl: current.sourceUrl,
        providerTitle: input.title,
        summary: input.summary,
        sourceContent: input.sourceContent,
        userTitle: current.userTitle,
        userNoteMarkdown: current.userNoteMarkdown,
      });
      const occupiedSlotIds = (await plants.list()).map((plant) => plant.slotId);
      const fragment: Fragment = {
        id: createId(),
        contentType: "link",
        title: built.title,
        rawText: null,
        sourceUrl: current.sourceUrl,
        contentMarkdown: built.markdown,
        summary: input.summary.trim().length === 0 ? null : input.summary.trim(),
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
      const createdEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "created",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const externalLinkImport: ExternalLinkImport = {
        id: createId(),
        fragmentId: fragment.id,
        provider: "getnote",
        sourceUrl: current.sourceUrl,
        normalizedUrl: normalizedSourceUrl,
        canonicalUrl: input.canonicalUrl,
        sourceContent: input.sourceContent.trim().length === 0 ? null : input.sourceContent,
        sourceContentTruncated: input.truncated,
        status: "completed",
        initiatedBy: current.initiator ?? "form",
        taskId: current.providerTaskId,
        externalNoteId: input.externalNoteId,
        providerRequestId: input.requestId,
        attemptCount: current.attemptCount,
        attemptGeneration: current.attemptGeneration,
        userProvidedTitle: current.userTitle !== null,
        userProvidedContent: current.userNoteMarkdown !== null,
        errorCode: null,
        errorMessage: null,
        terminalNotificationStatus: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: current.startedAt,
        lastPolledAt: current.lastPolledAt,
        completedAt: timestamp,
      };
      const completedJob: ContentProcessingJob = {
        ...current,
        status: "completed",
        createdFragmentId: fragment.id,
        processingRequestId: input.requestId ?? current.processingRequestId,
        resultTitle: built.title,
        resultMarkdown: built.markdown,
        errorCode: null,
        errorMessage: null,
        updatedAt: timestamp,
      };

      await fragments.add(fragment);
      await plants.add(plant);
      await events.add(createdEvent);
      await externalLinkImports.add(externalLinkImport);
      requireRecordUpdated(
        await jobs.update(current.id, {
          status: "completed",
          createdFragmentId: fragment.id,
          processingRequestId: completedJob.processingRequestId,
          resultTitle: built.title,
          resultMarkdown: built.markdown,
          errorCode: null,
          errorMessage: null,
          updatedAt: timestamp,
        }),
        "Content processing job",
      );

      return {
        didFinalize: true,
        didCreateFragment: true,
        job: completedJob,
        fragment,
        plant,
        createdEvent,
        externalLinkImport,
      };
    },
  );
}

export async function failLinkProcessingJob(
  input: FailLinkProcessingJobInput,
  dependencies: LocalServiceDependencies = {},
): Promise<FailLinkProcessingJobResult> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await repository.getById(input.jobId);
    if (current === undefined || current.kind !== "link") {
      throw new Error(`Link processing job ${input.jobId} was not found`);
    }
    if (
      isTerminalJob(current) ||
      (input.attempt !== undefined && !matchesLinkProcessingJobAttempt(current, input.attempt))
    ) {
      return { didFinalize: false, job: current };
    }

    const failedJob: ContentProcessingJob = {
      ...current,
      status: "failed",
      processingRequestId: input.requestId ?? current.processingRequestId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(current.id, {
        status: "failed",
        processingRequestId: failedJob.processingRequestId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return { didFinalize: true, job: failedJob };
  });
}
