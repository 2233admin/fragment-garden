import type { ExternalLinkImport, Fragment } from "../domain";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

async function requireExternalLinkImport(
  fragmentId: string,
  repository: ExternalLinkImportRepository,
): Promise<ExternalLinkImport> {
  const externalLinkImport = await repository.getByFragmentId(fragmentId);
  if (externalLinkImport === undefined) {
    throw new Error(`External link import for fragment ${fragmentId} was not found`);
  }

  return externalLinkImport;
}

export type ExternalLinkImportAttemptIdentity = Readonly<{
  attemptGeneration: number;
  taskId: string | null;
}>;

export function getExternalLinkImportAttemptGeneration(
  externalLinkImport: Pick<ExternalLinkImport, "attemptCount" | "attemptGeneration">,
): number {
  return Number.isSafeInteger(externalLinkImport.attemptGeneration) &&
    externalLinkImport.attemptGeneration >= 0
    ? externalLinkImport.attemptGeneration
    : externalLinkImport.attemptCount;
}

function matchesAttempt(
  externalLinkImport: ExternalLinkImport,
  attempt: ExternalLinkImportAttemptIdentity,
): boolean {
  return (
    getExternalLinkImportAttemptGeneration(externalLinkImport) === attempt.attemptGeneration &&
    externalLinkImport.taskId === attempt.taskId
  );
}

export async function prepareExternalLinkImportAttempt(
  fragmentId: string,
  inputNow: string,
  dependencies: LocalServiceDependencies = {},
): Promise<ExternalLinkImport> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(inputNow),
  });
  const repository = new ExternalLinkImportRepository(database);

  return database.transaction("rw", database.externalLinkImports, async () => {
    const current = await requireExternalLinkImport(fragmentId, repository);
    if (current.status !== "pending") {
      throw new Error(`External link import ${current.id} is not pending`);
    }
    if (current.attemptCount >= 2) {
      throw new Error(`External link import ${current.id} exhausted automatic attempts`);
    }

    const updated: ExternalLinkImport = {
      ...current,
      status: "pending",
      taskId: null,
      attemptGeneration: getExternalLinkImportAttemptGeneration(current) + 1,
      errorCode: null,
      errorMessage: null,
      providerRequestId: null,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(current.id, {
        status: "pending",
        taskId: updated.taskId,
        attemptGeneration: updated.attemptGeneration,
        errorCode: null,
        errorMessage: null,
        providerRequestId: null,
        updatedAt: timestamp,
      }),
      "External link import",
    );
    return updated;
  });
}

export async function recordExternalLinkImportAttemptSubmitted(
  fragmentId: string,
  input: Readonly<{ attemptGeneration: number; now: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ExternalLinkImport | null> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ExternalLinkImportRepository(database);

  return database.transaction("rw", database.externalLinkImports, async () => {
    const current = await requireExternalLinkImport(fragmentId, repository);
    if (
      current.status !== "pending" ||
      !matchesAttempt(current, { attemptGeneration: input.attemptGeneration, taskId: null })
    ) {
      return null;
    }
    if (current.attemptCount >= 2) {
      throw new Error(`External link import ${current.id} exhausted automatic attempts`);
    }

    const updated: ExternalLinkImport = {
      ...current,
      attemptCount: current.attemptCount + 1,
      startedAt: current.startedAt ?? timestamp,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(current.id, {
        attemptCount: updated.attemptCount,
        startedAt: updated.startedAt,
        updatedAt: timestamp,
      }),
      "External link import",
    );
    return updated;
  });
}

export async function recordExternalLinkImportStarted(
  fragmentId: string,
  input: Readonly<{
    attemptGeneration: number;
    taskId: string;
    requestId: string | null;
    now: string;
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ExternalLinkImport | null> {
  const taskId = input.taskId.trim();
  if (taskId.length === 0) {
    throw new Error("GetNote task id cannot be empty");
  }

  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ExternalLinkImportRepository(database);

  return database.transaction("rw", database.externalLinkImports, async () => {
    const current = await requireExternalLinkImport(fragmentId, repository);
    if (
      current.status !== "pending" ||
      current.attemptCount < 1 ||
      !matchesAttempt(current, { attemptGeneration: input.attemptGeneration, taskId: null })
    ) {
      return null;
    }

    const updated: ExternalLinkImport = {
      ...current,
      status: "processing",
      taskId,
      providerRequestId: input.requestId,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(current.id, {
        status: "processing",
        taskId,
        providerRequestId: input.requestId,
        updatedAt: timestamp,
      }),
      "External link import",
    );
    return updated;
  });
}

export async function recordExternalLinkImportPolled(
  fragmentId: string,
  input: Readonly<{
    attemptGeneration: number;
    taskId: string;
    requestId: string | null;
    now: string;
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<boolean> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ExternalLinkImportRepository(database);

  return database.transaction("rw", database.externalLinkImports, async () => {
    const current = await requireExternalLinkImport(fragmentId, repository);
    if (
      current.status !== "processing" ||
      !matchesAttempt(current, {
        attemptGeneration: input.attemptGeneration,
        taskId: input.taskId,
      })
    ) {
      return false;
    }

    requireRecordUpdated(
      await repository.update(current.id, {
        providerRequestId: input.requestId ?? current.providerRequestId,
        lastPolledAt: timestamp,
        updatedAt: timestamp,
      }),
      "External link import",
    );
    return true;
  });
}

export async function prepareExternalLinkImportAutomaticRetry(
  fragmentId: string,
  input: Readonly<ExternalLinkImportAttemptIdentity & { now: string }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ExternalLinkImport | null> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ExternalLinkImportRepository(database);

  return database.transaction("rw", database.externalLinkImports, async () => {
    const current = await requireExternalLinkImport(fragmentId, repository);
    if (current.status !== "processing" || !matchesAttempt(current, input)) {
      return null;
    }
    if (current.attemptCount >= 2) {
      throw new Error(`External link import ${current.id} cannot be retried automatically`);
    }

    const updated: ExternalLinkImport = {
      ...current,
      status: "pending",
      taskId: null,
      errorCode: null,
      errorMessage: null,
      providerRequestId: null,
      updatedAt: timestamp,
    };
    requireRecordUpdated(
      await repository.update(current.id, {
        status: "pending",
        taskId: null,
        errorCode: null,
        errorMessage: null,
        providerRequestId: null,
        updatedAt: timestamp,
      }),
      "External link import",
    );
    return updated;
  });
}

export async function resetExternalLinkImportForManualRetry(
  fragmentId: string,
  inputNow: string,
  dependencies: LocalServiceDependencies = {},
): Promise<Readonly<{ externalLinkImport: ExternalLinkImport; fragment: Fragment }>> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(inputNow),
  });
  const importRepository = new ExternalLinkImportRepository(database);
  const fragmentRepository = new FragmentRepository(database);

  return database.transaction("rw", database.externalLinkImports, database.fragments, async () => {
    const current = await requireExternalLinkImport(fragmentId, importRepository);
    const fragment = await fragmentRepository.getById(fragmentId);
    if (fragment === undefined) {
      throw new Error(`Fragment ${fragmentId} was not found`);
    }
    if (current.status !== "failed") {
      throw new Error(`External link import ${current.id} is not failed`);
    }

    const externalLinkImport: ExternalLinkImport = {
      ...current,
      status: "pending",
      taskId: null,
      externalNoteId: null,
      providerRequestId: null,
      attemptCount: 0,
      attemptGeneration: getExternalLinkImportAttemptGeneration(current) + 1,
      errorCode: null,
      errorMessage: null,
      terminalNotificationStatus: null,
      startedAt: null,
      lastPolledAt: null,
      completedAt: null,
      updatedAt: timestamp,
    };
    const updatedFragment: Fragment = {
      ...fragment,
      analysisStatus: "pending",
      updatedAt: timestamp,
    };

    requireRecordUpdated(
      await importRepository.update(current.id, {
        status: "pending",
        taskId: null,
        externalNoteId: null,
        providerRequestId: null,
        attemptCount: 0,
        attemptGeneration: externalLinkImport.attemptGeneration,
        errorCode: null,
        errorMessage: null,
        terminalNotificationStatus: null,
        startedAt: null,
        lastPolledAt: null,
        completedAt: null,
        updatedAt: timestamp,
      }),
      "External link import",
    );
    requireRecordUpdated(
      await fragmentRepository.update(fragmentId, {
        analysisStatus: "pending",
        updatedAt: timestamp,
      }),
      "Fragment",
    );

    return { externalLinkImport, fragment: updatedFragment };
  });
}
