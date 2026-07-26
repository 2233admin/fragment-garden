import {
  normalizeContentMarkdown,
  normalizeExternalUrl,
  type ContentProcessingJob,
  type ExternalLinkImport,
  type Fragment,
  type LinkImportInitiator,
} from "../domain";
import { findExistingLinkContent } from "../data/queries/content-processing-job-query";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import { externalUrlSchema } from "../validation/external-url";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreateLinkProcessingJobInput = Readonly<{
  sourceUrl: string;
  userTitle?: string;
  userNoteMarkdown?: string;
  initiatedBy: LinkImportInitiator;
  allowDuplicate?: boolean;
  now?: string;
}>;

export type CreateLinkProcessingJobResult =
  | Readonly<{ kind: "created"; job: ContentProcessingJob }>
  | Readonly<{
      kind: "duplicate_fragment";
      fragment: Fragment;
      externalLinkImport: ExternalLinkImport;
    }>
  | Readonly<{ kind: "duplicate_job"; job: ContentProcessingJob }>;

function optionalTrimmed(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}

export async function createLinkProcessingJob(
  input: CreateLinkProcessingJobInput,
  dependencies: LocalServiceDependencies = {},
): Promise<CreateLinkProcessingJobResult> {
  const sourceUrl = externalUrlSchema.parse(input.sourceUrl);
  const normalizedSourceUrl = normalizeExternalUrl(sourceUrl);
  const userTitle = optionalTrimmed(input.userTitle);
  const normalizedUserNote = normalizeContentMarkdown(input.userNoteMarkdown ?? "");
  const userNoteMarkdown = normalizedUserNote.length === 0 ? null : normalizedUserNote;
  const resolvedDependencies =
    input.now === undefined
      ? dependencies
      : { ...dependencies, now: () => new Date(input.now as string) };
  const { database, createId, timestamp } = resolveLocalServiceDependencies(resolvedDependencies);
  const repository = new ContentProcessingJobRepository(database);

  return database.transaction(
    "rw",
    database.contentProcessingJobs,
    database.fragments,
    database.externalLinkImports,
    async () => {
      if (input.allowDuplicate !== true) {
        const existing = await findExistingLinkContent(normalizedSourceUrl, database);
        if (existing?.kind === "fragment") {
          return {
            kind: "duplicate_fragment",
            fragment: existing.fragment,
            externalLinkImport: existing.externalLinkImport,
          };
        }
        if (existing?.kind === "job") {
          return { kind: "duplicate_job", job: existing.job };
        }
      }

      const job: ContentProcessingJob = {
        id: createId(),
        kind: "link",
        status: "pending",
        sourceUrl,
        normalizedSourceUrl,
        allowDuplicate: input.allowDuplicate === true,
        initiator: input.initiatedBy,
        userTitle,
        userNoteMarkdown,
        sourceBlob: null,
        sourceMimeType: null,
        sourceFileName: null,
        sourceWidth: null,
        sourceHeight: null,
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
      return { kind: "created", job };
    },
  );
}
