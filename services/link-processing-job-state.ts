import type { ContentProcessingJob } from "../domain";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type LinkProcessingJobAttemptIdentity = Readonly<{
  attemptGeneration: number;
  providerTaskId: string | null;
}>;

async function requireLinkJob(
  jobId: string,
  repository: ContentProcessingJobRepository,
): Promise<ContentProcessingJob> {
  const job = await repository.getById(jobId);
  if (job === undefined || job.kind !== "link") {
    throw new Error(`Link processing job ${jobId} was not found`);
  }
  return job;
}

export function getLinkProcessingJobAttemptGeneration(
  job: Pick<ContentProcessingJob, "attemptCount" | "attemptGeneration">,
): number {
  return Number.isSafeInteger(job.attemptGeneration) && job.attemptGeneration >= 0
    ? job.attemptGeneration
    : job.attemptCount;
}

export function matchesLinkProcessingJobAttempt(
  job: ContentProcessingJob,
  attempt: LinkProcessingJobAttemptIdentity,
): boolean {
  return (
    getLinkProcessingJobAttemptGeneration(job) === attempt.attemptGeneration &&
    job.providerTaskId === attempt.providerTaskId
  );
}

export async function prepareLinkProcessingJobAttempt(
  jobId: string,
  inputNow: string,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(inputNow),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await requireLinkJob(jobId, repository);
    if (current.status !== "pending") {
      throw new Error(`Link processing job ${jobId} is not pending`);
    }
    if (current.attemptCount >= 2) {
      throw new Error(`Link processing job ${jobId} exhausted automatic attempts`);
    }

    const updated: ContentProcessingJob = {
      ...current,
      providerTaskId: null,
      processingRequestId: null,
      errorCode: null,
      errorMessage: null,
      attemptGeneration: getLinkProcessingJobAttemptGeneration(current) + 1,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        providerTaskId: null,
        processingRequestId: null,
        errorCode: null,
        errorMessage: null,
        attemptGeneration: updated.attemptGeneration,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return updated;
  });
}

export async function recordLinkProcessingJobAttemptSubmitted(
  jobId: string,
  input: Readonly<{ attemptGeneration: number; now: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob | null> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await requireLinkJob(jobId, repository);
    if (
      current.status !== "pending" ||
      !matchesLinkProcessingJobAttempt(current, {
        attemptGeneration: input.attemptGeneration,
        providerTaskId: null,
      })
    ) {
      return null;
    }
    if (current.attemptCount >= 2) {
      throw new Error(`Link processing job ${jobId} exhausted automatic attempts`);
    }

    const updated: ContentProcessingJob = {
      ...current,
      status: "processing",
      attemptCount: current.attemptCount + 1,
      startedAt: current.startedAt ?? timestamp,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        status: "processing",
        attemptCount: updated.attemptCount,
        startedAt: updated.startedAt,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return updated;
  });
}

export async function recordLinkProcessingJobStarted(
  jobId: string,
  input: Readonly<{
    attemptGeneration: number;
    providerTaskId: string;
    requestId: string | null;
    now: string;
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob | null> {
  const providerTaskId = input.providerTaskId.trim();
  if (providerTaskId.length === 0) {
    throw new Error("GetNote task id cannot be empty");
  }

  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await requireLinkJob(jobId, repository);
    if (
      current.status !== "processing" ||
      current.attemptCount < 1 ||
      !matchesLinkProcessingJobAttempt(current, {
        attemptGeneration: input.attemptGeneration,
        providerTaskId: null,
      })
    ) {
      return null;
    }

    const updated: ContentProcessingJob = {
      ...current,
      status: "processing",
      providerTaskId,
      processingRequestId: input.requestId,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        status: "processing",
        providerTaskId,
        processingRequestId: input.requestId,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return updated;
  });
}

export async function recordLinkProcessingJobPolled(
  jobId: string,
  input: Readonly<LinkProcessingJobAttemptIdentity & { requestId: string | null; now: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<boolean> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await requireLinkJob(jobId, repository);
    if (current.status !== "processing" || !matchesLinkProcessingJobAttempt(current, input)) {
      return false;
    }

    requireRecordUpdated(
      await repository.update(jobId, {
        processingRequestId: input.requestId ?? current.processingRequestId,
        lastPolledAt: timestamp,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return true;
  });
}

export async function prepareLinkProcessingJobAutomaticRetry(
  jobId: string,
  input: Readonly<LinkProcessingJobAttemptIdentity & { now: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob | null> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await requireLinkJob(jobId, repository);
    if (current.status !== "processing" || !matchesLinkProcessingJobAttempt(current, input)) {
      return null;
    }
    if (current.attemptCount >= 2) {
      throw new Error(`Link processing job ${jobId} cannot be retried automatically`);
    }

    const updated: ContentProcessingJob = {
      ...current,
      status: "pending",
      providerTaskId: null,
      processingRequestId: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        status: "pending",
        providerTaskId: null,
        processingRequestId: null,
        errorCode: null,
        errorMessage: null,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return updated;
  });
}

export async function resetLinkProcessingJobForManualRetry(
  jobId: string,
  inputNow: string,
  dependencies: LocalServiceDependencies = {},
): Promise<ContentProcessingJob> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(inputNow),
  });
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await requireLinkJob(jobId, repository);
    if (current.status !== "failed") {
      throw new Error(`Link processing job ${jobId} is not failed`);
    }

    const updated: ContentProcessingJob = {
      ...current,
      status: "pending",
      providerTaskId: null,
      processingRequestId: null,
      resultTitle: null,
      resultMarkdown: null,
      errorCode: null,
      errorMessage: null,
      attemptCount: 0,
      attemptGeneration: getLinkProcessingJobAttemptGeneration(current) + 1,
      startedAt: null,
      lastPolledAt: null,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        status: "pending",
        providerTaskId: null,
        processingRequestId: null,
        resultTitle: null,
        resultMarkdown: null,
        errorCode: null,
        errorMessage: null,
        attemptCount: 0,
        attemptGeneration: updated.attemptGeneration,
        startedAt: null,
        lastPolledAt: null,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return updated;
  });
}
