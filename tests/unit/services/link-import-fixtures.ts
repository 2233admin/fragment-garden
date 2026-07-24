import type {
  ExternalLinkImport,
  Fragment,
  FragmentEvent,
  LinkImportInitiator,
  LinkImportStatus,
  Plant,
} from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import type {
  GetLinkImportProgressSuccessResponse,
  StartLinkImportSuccessResponse,
} from "../../../validation/link-import-api";

export const LINK_IMPORT_TEST_NOW = "2026-07-23T12:00:00.000Z";

export type SeededLinkImport = Readonly<{
  fragment: Fragment;
  plant: Plant;
  createdEvent: FragmentEvent;
  externalLinkImport: ExternalLinkImport;
}>;

export function createLinkImportTestDatabase(label: string): FragmentGardenDatabase {
  return new FragmentGardenDatabase(`fragment-garden-link-import-${label}-${crypto.randomUUID()}`);
}

export async function seedLinkImport(
  database: FragmentGardenDatabase,
  options: Readonly<{
    key?: string;
    status?: LinkImportStatus;
    initiatedBy?: LinkImportInitiator;
    userProvidedTitle?: boolean;
    userProvidedContent?: boolean;
    attemptCount?: number;
    taskId?: string | null;
    startedAt?: string | null;
    attemptGeneration?: number;
    terminalNotificationStatus?: "completed" | "failed" | null;
  }> = {},
): Promise<SeededLinkImport> {
  const key = options.key ?? "one";
  const status = options.status ?? "pending";
  const fragmentId = `fragment-${key}`;
  const sourceUrl = `https://example.com/${key}`;
  const fragment: Fragment = {
    id: fragmentId,
    contentType: "link",
    title: `用户标题 ${key}`,
    rawText: null,
    sourceUrl,
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus:
      status === "completed" ? "completed" : status === "failed" ? "failed" : "pending",
    embedding: null,
    parentFragmentId: null,
    createdAt: LINK_IMPORT_TEST_NOW,
    updatedAt: LINK_IMPORT_TEST_NOW,
    lastInteractedAt: LINK_IMPORT_TEST_NOW,
    completedAt: null,
  };
  const plant: Plant = {
    id: `plant-${key}`,
    fragmentId,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId: null,
    createdAt: LINK_IMPORT_TEST_NOW,
    updatedAt: LINK_IMPORT_TEST_NOW,
  };
  const createdEvent: FragmentEvent = {
    id: `event-${key}`,
    fragmentId,
    type: "created",
    payload: null,
    occurredAt: LINK_IMPORT_TEST_NOW,
    ruleVersion: 1,
  };
  const externalLinkImport: ExternalLinkImport = {
    id: `import-${key}`,
    fragmentId,
    provider: "getnote",
    sourceUrl,
    normalizedUrl: sourceUrl,
    canonicalUrl: null,
    sourceContent: null,
    sourceContentTruncated: false,
    status,
    initiatedBy: options.initiatedBy ?? "form",
    taskId:
      options.taskId !== undefined
        ? options.taskId
        : status === "processing"
          ? `task-${key}`
          : null,
    externalNoteId: null,
    providerRequestId: null,
    attemptCount: options.attemptCount ?? (status === "processing" || status === "failed" ? 1 : 0),
    attemptGeneration:
      options.attemptGeneration ??
      options.attemptCount ??
      (status === "processing" || status === "failed" ? 1 : 0),
    userProvidedTitle: options.userProvidedTitle ?? false,
    userProvidedContent: options.userProvidedContent ?? false,
    errorCode: status === "failed" ? "network_error" : null,
    errorMessage: status === "failed" ? "读取失败" : null,
    terminalNotificationStatus: options.terminalNotificationStatus ?? null,
    createdAt: LINK_IMPORT_TEST_NOW,
    updatedAt: LINK_IMPORT_TEST_NOW,
    startedAt:
      options.startedAt !== undefined
        ? options.startedAt
        : status === "processing"
          ? LINK_IMPORT_TEST_NOW
          : null,
    lastPolledAt: null,
    completedAt: status === "completed" ? LINK_IMPORT_TEST_NOW : null,
  };

  await database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    database.externalLinkImports,
    async () => {
      await database.fragments.add(fragment);
      await database.plants.add(plant);
      await database.fragmentEvents.add(createdEvent);
      await database.externalLinkImports.add(externalLinkImport);
    },
  );

  return { fragment, plant, createdEvent, externalLinkImport };
}

export function createCompletedImportResponse(
  key = "one",
): StartLinkImportSuccessResponse & GetLinkImportProgressSuccessResponse {
  return {
    status: "completed",
    externalNoteId: `external-note-${key}`,
    title: `Provider 标题 ${key}`,
    summary: `Provider 摘要 ${key}`,
    sourceContent: `Provider 正文 ${key}`,
    canonicalUrl: `https://example.com/${key}/canonical`,
    truncated: true,
    requestId: `request-${key}`,
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

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}
