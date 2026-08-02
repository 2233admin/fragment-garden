import type { ContentProcessingJob } from "../domain";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export async function cancelContentProcessingJob(
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
    const current = await repository.getById(jobId);
    if (current === undefined) {
      throw new Error(`Content processing job ${jobId} was not found`);
    }
    if (current.status === "completed") {
      throw new Error(`Completed content processing job ${jobId} cannot be cancelled`);
    }
    if (current.status === "cancelled") return current;

    const cancelled: ContentProcessingJob = {
      ...current,
      status: "cancelled",
      sourceBlob: current.kind === "image" ? null : current.sourceBlob,
      processingRequestId: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(jobId, {
        status: "cancelled",
        sourceBlob: cancelled.sourceBlob,
        processingRequestId: null,
        errorCode: null,
        errorMessage: null,
        updatedAt: timestamp,
      }),
      "Content processing job",
    );
    return cancelled;
  });
}

export async function deleteContentProcessingJob(
  jobId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<void> {
  const { database } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);

  await database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await repository.getById(jobId);
    if (current === undefined) return;
    if (
      current.status !== "failed" &&
      current.status !== "cancelled" &&
      current.status !== "completed"
    ) {
      throw new Error(`Active content processing job ${jobId} must be cancelled before deletion`);
    }
    await repository.delete(jobId);
  });
}

export async function dismissCompletedContentProcessingJob(
  jobId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<boolean> {
  const { database } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const current = await repository.getById(jobId);
    if (current === undefined) return false;
    if (current.status !== "completed" || current.createdFragmentId === null) {
      throw new Error(`Content processing job ${jobId} is not a completed note`);
    }
    await repository.delete(jobId);
    return true;
  });
}

/** Removes transient payloads only after a task can no longer need them for retry or preview. */
export async function cleanupSettledContentProcessingJobs(
  dependencies: LocalServiceDependencies = {},
): Promise<number> {
  const { database } = resolveLocalServiceDependencies(dependencies);
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction("rw", database.contentProcessingJobs, async () => {
    const jobs = await repository.listByStatuses(["completed", "cancelled"]);
    let cleanedCount = 0;

    for (const job of jobs) {
      const shouldClearBlob = job.sourceBlob !== null;
      const shouldClearSproutPreview =
        job.kind === "sprout" &&
        (job.sourceSnapshot !== null ||
          job.resultMarkdown !== null ||
          (job.status === "cancelled" && job.resultTitle !== null));
      if (!shouldClearBlob && !shouldClearSproutPreview) continue;

      cleanedCount += await repository.update(job.id, {
        ...(shouldClearBlob ? { sourceBlob: null } : {}),
        ...(shouldClearSproutPreview
          ? {
              sourceSnapshot: null,
              resultMarkdown: null,
              resultTitle: job.status === "cancelled" ? null : job.resultTitle,
            }
          : {}),
        processingRequestId: null,
        providerTaskId: job.status === "cancelled" ? null : job.providerTaskId,
      });
    }

    return cleanedCount;
  });
}
