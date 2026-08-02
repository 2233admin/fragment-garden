import type { ContentProcessingJob } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import type { CompletedLinkImportPayload } from "../../../validation/link-import-api";

export const PROCESSING_JOB_TEST_NOW = "2026-07-26T08:00:00.000Z";

export function createContentProcessingJobDatabase(label: string): FragmentGardenDatabase {
  return new FragmentGardenDatabase(
    `fragment-garden-content-processing-${label}-${crypto.randomUUID()}`,
  );
}

export function createLinkProcessingJobRecord(
  overrides: Partial<ContentProcessingJob> = {},
): ContentProcessingJob {
  const status = overrides.status ?? "pending";
  return {
    id: "link-job-1",
    kind: "link",
    status,
    sourceUrl: "https://example.com/article",
    normalizedSourceUrl: "https://example.com/article",
    allowDuplicate: false,
    initiator: "form",
    userTitle: null,
    userNoteMarkdown: null,
    sourceBlob: null,
    sourceMimeType: null,
    sourceFileName: null,
    sourceWidth: null,
    sourceHeight: null,
    sourceFragmentId: null,
    sourceSnapshot: null,
    createdFragmentId: null,
    providerTaskId: status === "processing" ? "provider-task-1" : null,
    processingRequestId: null,
    resultTitle: null,
    resultMarkdown: null,
    errorCode: status === "failed" ? "network_error" : null,
    errorMessage: status === "failed" ? "暂时无法读取" : null,
    attemptCount: status === "processing" || status === "failed" ? 1 : 0,
    attemptGeneration: status === "processing" || status === "failed" ? 1 : 0,
    createdAt: PROCESSING_JOB_TEST_NOW,
    updatedAt: PROCESSING_JOB_TEST_NOW,
    startedAt: status === "processing" ? PROCESSING_JOB_TEST_NOW : null,
    lastPolledAt: null,
    ...overrides,
  };
}

export function createCompletedJobImportResponse(key = "one"): CompletedLinkImportPayload {
  return {
    status: "completed",
    externalNoteId: `external-note-${key}`,
    title: `Provider 标题 ${key}`,
    summary: `Provider 摘要 ${key}`,
    sourceContent: `# Provider 正文 ${key}\n\n正文内容。`,
    canonicalUrl: `https://example.com/${key}/canonical`,
    truncated: false,
    requestId: `provider-request-${key}`,
  };
}

export type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}>;

export function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
