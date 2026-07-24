import type { ChatMessage, ExternalLinkImport, Fragment } from "../domain";
import { ChatMessageRepository } from "../data/repositories/chat-message-repository";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";
import {
  getExternalLinkImportAttemptGeneration,
  type ExternalLinkImportAttemptIdentity,
} from "./external-link-import-state";

export const LINK_IMPORT_COMPLETED_COMPANION_MESSAGE = "链接内容读取完成，已经更新到这株植物里。";
export const LINK_IMPORT_FAILED_COMPANION_MESSAGE =
  "链接已经保留下来，但暂时没能读取完整内容。你可以稍后重试或手动补充。";

export type CompleteExternalLinkImportInput = Readonly<{
  fragmentId: string;
  externalNoteId: string;
  title: string;
  summary: string;
  sourceContent: string;
  canonicalUrl: string;
  truncated: boolean;
  requestId: string | null;
  attempt: ExternalLinkImportAttemptIdentity;
  now: string;
}>;

export type FailExternalLinkImportInput = Readonly<{
  fragmentId: string;
  errorCode: string;
  errorMessage: string;
  requestId: string | null;
  attempt?: ExternalLinkImportAttemptIdentity;
  now: string;
}>;

export type FinalizeExternalLinkImportResult = Readonly<{
  didFinalize: boolean;
  externalLinkImport: ExternalLinkImport;
  fragment: Fragment;
  notification: ChatMessage | null;
}>;

function matchesAttempt(
  externalLinkImport: ExternalLinkImport,
  attempt: ExternalLinkImportAttemptIdentity,
): boolean {
  return (
    getExternalLinkImportAttemptGeneration(externalLinkImport) === attempt.attemptGeneration &&
    externalLinkImport.taskId === attempt.taskId
  );
}

function nextMessageTimestamp(
  existingMessages: readonly ChatMessage[],
  requestedAt: string,
): string {
  const requestedTimestamp = Date.parse(requestedAt);
  const latestTimestamp = Date.parse(existingMessages.at(-1)?.createdAt ?? "");

  return new Date(
    Math.max(
      Number.isFinite(requestedTimestamp) ? requestedTimestamp : 0,
      Number.isFinite(latestTimestamp) ? latestTimestamp + 1 : 0,
    ),
  ).toISOString();
}

export async function completeExternalLinkImport(
  input: CompleteExternalLinkImportInput,
  dependencies: LocalServiceDependencies = {},
): Promise<FinalizeExternalLinkImportResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const importRepository = new ExternalLinkImportRepository(database);
  const fragmentRepository = new FragmentRepository(database);
  const chatRepository = new ChatMessageRepository(database);

  return database.transaction(
    "rw",
    database.externalLinkImports,
    database.fragments,
    database.chatMessages,
    async () => {
      const [current, fragment] = await Promise.all([
        importRepository.getByFragmentId(input.fragmentId),
        fragmentRepository.getById(input.fragmentId),
      ]);
      if (current === undefined || fragment === undefined) {
        throw new Error(`Link fragment ${input.fragmentId} could not be finalized`);
      }
      if (
        current.status === "completed" ||
        current.status === "failed" ||
        !matchesAttempt(current, input.attempt)
      ) {
        return {
          didFinalize: false,
          externalLinkImport: current,
          fragment,
          notification: null,
        };
      }

      const providerTitle = input.title.trim();
      const title =
        current.userProvidedTitle || providerTitle.length === 0 ? fragment.title : providerTitle;
      const summary = input.summary.trim().length === 0 ? null : input.summary;
      const sourceContent = input.sourceContent.trim().length === 0 ? null : input.sourceContent;
      const rawText = current.userProvidedContent ? fragment.rawText : sourceContent;
      const updatedFragment: Fragment = {
        ...fragment,
        title,
        rawText,
        summary,
        analysisStatus: "completed",
        updatedAt: timestamp,
      };
      const shouldNotify =
        current.initiatedBy === "companion" && current.terminalNotificationStatus !== "completed";
      const updatedImport: ExternalLinkImport = {
        ...current,
        canonicalUrl: input.canonicalUrl,
        sourceContent,
        sourceContentTruncated: input.truncated,
        status: "completed",
        externalNoteId: input.externalNoteId,
        providerRequestId: input.requestId ?? current.providerRequestId,
        errorCode: null,
        errorMessage: null,
        terminalNotificationStatus: shouldNotify ? "completed" : current.terminalNotificationStatus,
        updatedAt: timestamp,
        completedAt: timestamp,
      };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          title,
          rawText,
          summary,
          analysisStatus: "completed",
          updatedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await importRepository.update(current.id, {
          canonicalUrl: input.canonicalUrl,
          sourceContent,
          sourceContentTruncated: input.truncated,
          status: "completed",
          externalNoteId: input.externalNoteId,
          providerRequestId: input.requestId ?? current.providerRequestId,
          errorCode: null,
          errorMessage: null,
          terminalNotificationStatus: updatedImport.terminalNotificationStatus,
          updatedAt: timestamp,
          completedAt: timestamp,
        }),
        "External link import",
      );

      let notification: ChatMessage | null = null;
      if (shouldNotify) {
        const messages = await chatRepository.list();
        notification = {
          id: createId(),
          role: "assistant",
          content: LINK_IMPORT_COMPLETED_COMPANION_MESSAGE,
          fragmentId: fragment.id,
          createdAt: nextMessageTimestamp(messages, timestamp),
        };
        await chatRepository.add(notification);
      }

      return {
        didFinalize: true,
        externalLinkImport: updatedImport,
        fragment: updatedFragment,
        notification,
      };
    },
  );
}

export async function failExternalLinkImport(
  input: FailExternalLinkImportInput,
  dependencies: LocalServiceDependencies = {},
): Promise<FinalizeExternalLinkImportResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const importRepository = new ExternalLinkImportRepository(database);
  const fragmentRepository = new FragmentRepository(database);
  const chatRepository = new ChatMessageRepository(database);

  return database.transaction(
    "rw",
    database.externalLinkImports,
    database.fragments,
    database.chatMessages,
    async () => {
      const [current, fragment] = await Promise.all([
        importRepository.getByFragmentId(input.fragmentId),
        fragmentRepository.getById(input.fragmentId),
      ]);
      if (current === undefined || fragment === undefined) {
        throw new Error(`Link fragment ${input.fragmentId} could not be marked failed`);
      }
      if (
        current.status === "completed" ||
        current.status === "failed" ||
        (input.attempt !== undefined && !matchesAttempt(current, input.attempt))
      ) {
        return {
          didFinalize: false,
          externalLinkImport: current,
          fragment,
          notification: null,
        };
      }

      const shouldNotify =
        current.initiatedBy === "companion" && current.terminalNotificationStatus !== "failed";
      const updatedFragment: Fragment = {
        ...fragment,
        analysisStatus: "failed",
        updatedAt: timestamp,
      };
      const updatedImport: ExternalLinkImport = {
        ...current,
        status: "failed",
        providerRequestId: input.requestId ?? current.providerRequestId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        terminalNotificationStatus: shouldNotify ? "failed" : current.terminalNotificationStatus,
        updatedAt: timestamp,
      };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          analysisStatus: "failed",
          updatedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await importRepository.update(current.id, {
          status: "failed",
          providerRequestId: input.requestId ?? current.providerRequestId,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          terminalNotificationStatus: updatedImport.terminalNotificationStatus,
          updatedAt: timestamp,
        }),
        "External link import",
      );

      let notification: ChatMessage | null = null;
      if (shouldNotify) {
        const messages = await chatRepository.list();
        notification = {
          id: createId(),
          role: "assistant",
          content: LINK_IMPORT_FAILED_COMPANION_MESSAGE,
          fragmentId: fragment.id,
          createdAt: nextMessageTimestamp(messages, timestamp),
        };
        await chatRepository.add(notification);
      }

      return {
        didFinalize: true,
        externalLinkImport: updatedImport,
        fragment: updatedFragment,
        notification,
      };
    },
  );
}
