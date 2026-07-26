import type { ContentProcessingJob, ExternalLinkImport, Fragment } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { findExistingExternalLinkImport } from "./external-link-import-query";
import { ContentProcessingJobRepository } from "../repositories/content-processing-job-repository";

const ACTIVE_LINK_JOB_STATUSES = ["pending", "processing"] as const;

export type ExistingLinkContent =
  | Readonly<{
      kind: "fragment";
      fragment: Fragment;
      externalLinkImport: ExternalLinkImport;
    }>
  | Readonly<{
      kind: "job";
      job: ContentProcessingJob;
    }>;

export async function findExistingLinkProcessingJob(
  normalizedSourceUrl: string,
  database: FragmentGardenDatabase = fragmentGardenDb,
  excludeJobId?: string,
): Promise<ContentProcessingJob | null> {
  const jobs = await new ContentProcessingJobRepository(database).listByNormalizedSourceUrl(
    normalizedSourceUrl,
  );

  return (
    jobs.find(
      (job) =>
        job.id !== excludeJobId &&
        job.kind === "link" &&
        ACTIVE_LINK_JOB_STATUSES.includes(job.status as (typeof ACTIVE_LINK_JOB_STATUSES)[number]),
    ) ?? null
  );
}

export async function findExistingLinkContent(
  normalizedSourceUrl: string,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<ExistingLinkContent | null> {
  const existingFragment = await findExistingExternalLinkImport(normalizedSourceUrl, database);
  if (existingFragment !== null) {
    return { kind: "fragment", ...existingFragment };
  }

  const existingJob = await findExistingLinkProcessingJob(normalizedSourceUrl, database);
  return existingJob === null ? null : { kind: "job", job: existingJob };
}
