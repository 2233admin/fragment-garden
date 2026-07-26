import type {
  ContentProcessingJob,
  ContentProcessingJobKind,
  ContentProcessingJobStatus,
} from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type ContentProcessingJobUpdate = Partial<
  Omit<ContentProcessingJob, "id" | "kind" | "createdAt">
>;

function compareJobs(left: ContentProcessingJob, right: ContentProcessingJob): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
}

/** Supplies fields added while V5 was still an empty reserved store. */
function normalizeJob(job: ContentProcessingJob): ContentProcessingJob {
  return {
    ...job,
    normalizedSourceUrl: job.normalizedSourceUrl ?? null,
    allowDuplicate: job.allowDuplicate ?? false,
    initiator: job.initiator ?? null,
    userTitle: job.userTitle ?? null,
    userNoteMarkdown: job.userNoteMarkdown ?? null,
    sourceWidth: job.sourceWidth ?? null,
    sourceHeight: job.sourceHeight ?? null,
    errorMessage: job.errorMessage ?? null,
    attemptGeneration: job.attemptGeneration ?? job.attemptCount,
    startedAt: job.startedAt ?? null,
    lastPolledAt: job.lastPolledAt ?? null,
  };
}

export class ContentProcessingJobRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  async getById(id: string): Promise<ContentProcessingJob | undefined> {
    const job = await this.database.contentProcessingJobs.get(id);
    return job === undefined ? undefined : normalizeJob(job);
  }

  async list(): Promise<ContentProcessingJob[]> {
    const jobs = await this.database.contentProcessingJobs.toArray();
    return jobs.map(normalizeJob).sort(compareJobs);
  }

  async listByKind(kind: ContentProcessingJobKind): Promise<ContentProcessingJob[]> {
    const jobs = await this.database.contentProcessingJobs.where("kind").equals(kind).toArray();
    return jobs.map(normalizeJob).sort(compareJobs);
  }

  async listByStatuses(
    statuses: readonly ContentProcessingJobStatus[],
  ): Promise<ContentProcessingJob[]> {
    const uniqueStatuses = [...new Set(statuses)];
    if (uniqueStatuses.length === 0) return [];

    const jobs = await this.database.contentProcessingJobs
      .where("status")
      .anyOf(uniqueStatuses)
      .toArray();
    return jobs.map(normalizeJob).sort(compareJobs);
  }

  async listByKindAndStatuses(
    kind: ContentProcessingJobKind,
    statuses: readonly ContentProcessingJobStatus[],
  ): Promise<ContentProcessingJob[]> {
    return this.listByKindsAndStatuses([kind], statuses);
  }

  async listByKindsAndStatuses(
    kinds: readonly ContentProcessingJobKind[],
    statuses: readonly ContentProcessingJobStatus[],
  ): Promise<ContentProcessingJob[]> {
    const kindSet = new Set(kinds);
    const statusSet = new Set(statuses);
    if (kindSet.size === 0 || statusSet.size === 0) return [];

    const jobs = await this.database.contentProcessingJobs
      .where("kind")
      .anyOf([...kindSet])
      .toArray();
    return jobs
      .map(normalizeJob)
      .filter((job) => kindSet.has(job.kind) && statusSet.has(job.status))
      .sort(compareJobs);
  }

  async listByNormalizedSourceUrl(normalizedSourceUrl: string): Promise<ContentProcessingJob[]> {
    const jobs = await this.database.contentProcessingJobs
      .filter((job) => job.normalizedSourceUrl === normalizedSourceUrl)
      .toArray();
    return jobs.map(normalizeJob).sort(compareJobs);
  }

  add(job: ContentProcessingJob): Promise<string> {
    return this.database.contentProcessingJobs.add(job);
  }

  update(id: string, changes: ContentProcessingJobUpdate): Promise<number> {
    return this.database.contentProcessingJobs.update(id, changes);
  }

  delete(id: string): Promise<void> {
    return this.database.contentProcessingJobs.delete(id);
  }
}
