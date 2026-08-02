import type { ExternalLinkImport } from "../domain";
import { ExternalLinkImportRepository } from "../data/repositories/external-link-import-repository";
import { fragmentGardenDb } from "../data/db";
import {
  completeExternalLinkImport,
  failExternalLinkImport,
} from "./finalize-external-link-import";
import {
  getExternalLinkImportAttemptGeneration,
  prepareExternalLinkImportAttempt,
  prepareExternalLinkImportAutomaticRetry,
  recordExternalLinkImportAttemptSubmitted,
  recordExternalLinkImportPolled,
  recordExternalLinkImportStarted,
  resetExternalLinkImportForManualRetry,
  type ExternalLinkImportAttemptIdentity,
} from "./external-link-import-state";
import {
  LinkImportApiClient,
  LinkImportApiClientError,
  type LinkImportApi,
} from "./link-import-api-client";
import type { LocalServiceDependencies } from "./local-service-dependencies";

export const LINK_IMPORT_POLL_INTERVAL_MS = 10_000;
export const LINK_IMPORT_MAX_DURATION_MS = 10 * 60 * 1000;
export const LINK_IMPORT_MAX_CONCURRENCY = 2;

export type ExternalLinkImportManagerEvent = Readonly<{
  type: "completed" | "failed";
  fragmentId: string;
  message: string;
}>;

type TimeoutHandle = ReturnType<typeof setTimeout>;
type PendingWaitKind = "offline" | "poll";
type PendingWait = Readonly<{
  handle: TimeoutHandle;
  kind: PendingWaitKind;
  resolve: (shouldContinue: boolean) => void;
}>;
type ActiveRequest = Readonly<{
  controller: AbortController;
  clearDeadline: () => void;
  didReachDeadline: () => boolean;
}>;
type ModuleLockRelease = () => void;
type ModuleLockWaiter = Readonly<{
  signal: AbortSignal;
  onAbort: () => void;
  resolve: (release: ModuleLockRelease | null) => void;
}>;
type ModuleLockState = {
  isLocked: boolean;
  waiters: ModuleLockWaiter[];
};

const MODULE_FRAGMENT_LOCKS = new Map<string, ModuleLockState>();

function createModuleLockRelease(lockName: string, state: ModuleLockState): ModuleLockRelease {
  let didRelease = false;

  return () => {
    if (didRelease) {
      return;
    }
    didRelease = true;

    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift();
      if (waiter === undefined) {
        break;
      }
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) {
        waiter.resolve(null);
        continue;
      }

      waiter.resolve(createModuleLockRelease(lockName, state));
      return;
    }

    state.isLocked = false;
    if (MODULE_FRAGMENT_LOCKS.get(lockName) === state) {
      MODULE_FRAGMENT_LOCKS.delete(lockName);
    }
  };
}

function acquireModuleFragmentLock(
  lockName: string,
  signal: AbortSignal,
): Promise<ModuleLockRelease | null> {
  if (signal.aborted) {
    return Promise.resolve(null);
  }

  const state = MODULE_FRAGMENT_LOCKS.get(lockName) ?? {
    isLocked: false,
    waiters: [],
  };
  MODULE_FRAGMENT_LOCKS.set(lockName, state);

  if (!state.isLocked) {
    state.isLocked = true;
    return Promise.resolve(createModuleLockRelease(lockName, state));
  }

  return new Promise((resolve) => {
    const waiter: ModuleLockWaiter = {
      signal,
      onAbort: () => {
        const waiterIndex = state.waiters.indexOf(waiter);
        if (waiterIndex >= 0) {
          state.waiters.splice(waiterIndex, 1);
        }
        resolve(null);
      },
      resolve,
    };
    state.waiters.push(waiter);
    signal.addEventListener("abort", waiter.onAbort, { once: true });
  });
}

function getWebLockManager(): LockManager | null {
  return typeof navigator !== "undefined" &&
    navigator.locks !== undefined &&
    typeof navigator.locks.request === "function"
    ? navigator.locks
    : null;
}

export type ExternalLinkImportManagerOptions = Readonly<{
  api?: LinkImportApi;
  localDependencies?: Pick<LocalServiceDependencies, "database" | "createId">;
  now?: () => Date;
  isOnline?: () => boolean;
  pollIntervalMs?: number;
  maxDurationMs?: number;
  maxConcurrency?: number;
  onEvent?: (event: ExternalLinkImportManagerEvent) => void;
}>;

function isTerminalStatus(status: ExternalLinkImport["status"]): boolean {
  return status === "completed" || status === "failed";
}

export class ExternalLinkImportManager {
  private readonly api: LinkImportApi;
  private readonly localDependencies: Pick<LocalServiceDependencies, "database" | "createId">;
  private readonly now: () => Date;
  private readonly isOnline: () => boolean;
  private readonly pollIntervalMs: number;
  private readonly maxDurationMs: number;
  private readonly maxConcurrency: number;
  private readonly onEvent?: (event: ExternalLinkImportManagerEvent) => void;
  private readonly queuedFragmentIds = new Set<string>();
  private readonly activeFragmentIds = new Set<string>();
  private readonly queue: string[] = [];
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly pendingLockRequests = new Map<string, AbortController>();
  private readonly pendingWaits = new Map<string, PendingWait>();
  private readonly idleWaiters = new Set<() => void>();
  private isDisposed = false;

  constructor(options: ExternalLinkImportManagerOptions = {}) {
    this.api = options.api ?? new LinkImportApiClient();
    this.localDependencies = options.localDependencies ?? {};
    this.now = options.now ?? (() => new Date());
    this.isOnline =
      options.isOnline ??
      (() =>
        typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
          ? true
          : navigator.onLine);
    this.pollIntervalMs = options.pollIntervalMs ?? LINK_IMPORT_POLL_INTERVAL_MS;
    this.maxDurationMs = options.maxDurationMs ?? LINK_IMPORT_MAX_DURATION_MS;
    this.maxConcurrency = options.maxConcurrency ?? LINK_IMPORT_MAX_CONCURRENCY;
    this.onEvent = options.onEvent;
  }

  startExternalLinkImport(fragmentId: string): void {
    this.enqueue(fragmentId);
  }

  async retryExternalLinkImport(fragmentId: string): Promise<void> {
    await resetExternalLinkImportForManualRetry(
      fragmentId,
      this.timestamp(),
      this.localDependencies,
    );
    this.enqueue(fragmentId, true);
  }

  async resumePendingLinkImports(): Promise<void> {
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const imports = await new ExternalLinkImportRepository(database).listByStatuses([
      "pending",
      "processing",
    ]);
    for (const externalLinkImport of imports) {
      if (!this.wakePendingWait(externalLinkImport.fragmentId)) {
        this.enqueue(externalLinkImport.fragmentId);
      }
    }
  }

  whenIdle(): Promise<void> {
    if (this.queue.length === 0 && this.activeFragmentIds.size === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  dispose(): void {
    this.isDisposed = true;
    this.queue.length = 0;
    this.queuedFragmentIds.clear();
    for (const request of this.activeRequests.values()) {
      request.clearDeadline();
      request.controller.abort();
    }
    for (const controller of this.pendingLockRequests.values()) {
      controller.abort();
    }
    for (const pendingWait of this.pendingWaits.values()) {
      clearTimeout(pendingWait.handle);
      pendingWait.resolve(false);
    }
    this.activeRequests.clear();
    this.pendingLockRequests.clear();
    this.pendingWaits.clear();
    this.resolveIdleWaiters();
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private getAttemptIdentity(
    externalLinkImport: ExternalLinkImport,
  ): ExternalLinkImportAttemptIdentity {
    return {
      attemptGeneration: getExternalLinkImportAttemptGeneration(externalLinkImport),
      taskId: externalLinkImport.taskId,
    };
  }

  private enqueue(fragmentId: string, shouldQueueAfterActive = false): void {
    if (this.isDisposed || this.queuedFragmentIds.has(fragmentId)) {
      return;
    }

    if (this.activeFragmentIds.has(fragmentId) && !shouldQueueAfterActive) {
      return;
    }

    this.queue.push(fragmentId);
    this.queuedFragmentIds.add(fragmentId);
    this.pump();
  }

  private pump(): void {
    while (
      !this.isDisposed &&
      this.activeFragmentIds.size < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const fragmentId = this.queue.shift();
      if (fragmentId === undefined) {
        break;
      }

      this.queuedFragmentIds.delete(fragmentId);
      this.activeFragmentIds.add(fragmentId);
      void this.processSafely(fragmentId);
    }
  }

  private async processSafely(fragmentId: string): Promise<void> {
    try {
      await this.processWithExclusiveLock(fragmentId);
    } catch {
      await this.markUnexpectedProcessFailure(fragmentId).catch(() => undefined);
    } finally {
      this.activeRequests.get(fragmentId)?.clearDeadline();
      this.activeRequests.delete(fragmentId);
      this.activeFragmentIds.delete(fragmentId);
      this.pump();
      this.resolveIdleWaiters();
    }
  }

  private async processWithExclusiveLock(fragmentId: string): Promise<void> {
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const lockName = `fragment-garden:link-import:${database.name}:${fragmentId}`;
    const controller = new AbortController();
    this.pendingLockRequests.set(fragmentId, controller);

    try {
      const webLockManager = getWebLockManager();
      if (webLockManager !== null) {
        try {
          await webLockManager.request(
            lockName,
            { mode: "exclusive", signal: controller.signal },
            async () => {
              if (!this.isDisposed) {
                await this.process(fragmentId);
              }
            },
          );
        } catch (error) {
          if (!controller.signal.aborted) {
            throw error;
          }
        }
        return;
      }

      const release = await acquireModuleFragmentLock(lockName, controller.signal);
      if (release === null) {
        return;
      }
      try {
        if (!this.isDisposed) {
          await this.process(fragmentId);
        }
      } finally {
        release();
      }
    } finally {
      if (this.pendingLockRequests.get(fragmentId) === controller) {
        this.pendingLockRequests.delete(fragmentId);
      }
    }
  }

  private async process(fragmentId: string): Promise<void> {
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const repository = new ExternalLinkImportRepository(database);
    let shouldRespectPersistedPollSchedule = true;

    while (!this.isDisposed) {
      const current = await repository.getByFragmentId(fragmentId);
      if (this.isDisposed) {
        return;
      }
      if (current === undefined || isTerminalStatus(current.status)) {
        return;
      }

      if (this.hasTimedOut(current)) {
        await this.markTimedOut(current);
        return;
      }

      if (!this.isOnline()) {
        const offlineWaitDuration = Math.min(
          this.pollIntervalMs,
          this.getRemainingProcessingDuration(current.startedAt),
        );
        if (!(await this.wait(fragmentId, offlineWaitDuration, "offline"))) {
          return;
        }
        continue;
      }

      if (current.status === "pending") {
        if (!(await this.startAttempt(current))) {
          return;
        }
        continue;
      }

      if (current.taskId === null) {
        await this.markFailed(
          current,
          "unknown_error",
          "上次读取在保存任务编号前中断。为避免重复创建远端笔记，请手动重新读取。",
          current.providerRequestId,
        );
        return;
      }

      if (shouldRespectPersistedPollSchedule) {
        shouldRespectPersistedPollSchedule = false;
        const remainingDelay = Math.min(
          this.getRemainingPollDelay(current.lastPolledAt),
          this.getRemainingProcessingDuration(current.startedAt),
        );
        if (remainingDelay > 0) {
          if (!(await this.wait(fragmentId, remainingDelay, "poll"))) {
            return;
          }
          continue;
        }
      }

      if (!(await this.poll(current))) {
        return;
      }
    }
  }

  private hasTimedOut(current: ExternalLinkImport): boolean {
    if (current.startedAt === null) {
      return false;
    }

    const startedAt = Date.parse(current.startedAt);
    return Number.isFinite(startedAt) && this.now().getTime() - startedAt >= this.maxDurationMs;
  }

  private getRemainingPollDelay(lastPolledAt: string | null): number {
    if (lastPolledAt === null) {
      return 0;
    }

    const lastPolledTimestamp = Date.parse(lastPolledAt);
    if (!Number.isFinite(lastPolledTimestamp)) {
      return 0;
    }

    const remainingDelay = lastPolledTimestamp + this.pollIntervalMs - this.now().getTime();
    return Math.max(0, Math.min(this.pollIntervalMs, remainingDelay));
  }

  private getRemainingProcessingDuration(startedAt: string | null): number {
    if (startedAt === null) {
      return this.maxDurationMs;
    }

    const startedAtTimestamp = Date.parse(startedAt);
    if (!Number.isFinite(startedAtTimestamp)) {
      return this.maxDurationMs;
    }

    const remainingDuration = startedAtTimestamp + this.maxDurationMs - this.now().getTime();
    return Math.max(0, Math.min(this.maxDurationMs, remainingDuration));
  }

  private createRequest(fragmentId: string, startedAt: string | null): ActiveRequest {
    const previousRequest = this.activeRequests.get(fragmentId);
    previousRequest?.clearDeadline();
    previousRequest?.controller.abort();

    const controller = new AbortController();
    let didReachDeadline = false;
    let deadlineHandle: TimeoutHandle | null = null;
    const clearDeadline = (): void => {
      if (deadlineHandle !== null) {
        clearTimeout(deadlineHandle);
        deadlineHandle = null;
      }
    };
    const remainingDuration = this.getRemainingProcessingDuration(startedAt);
    if (remainingDuration === 0) {
      didReachDeadline = true;
      controller.abort();
    } else {
      deadlineHandle = setTimeout(() => {
        deadlineHandle = null;
        didReachDeadline = true;
        controller.abort();
      }, remainingDuration);
    }

    const request: ActiveRequest = {
      controller,
      clearDeadline,
      didReachDeadline: () => didReachDeadline,
    };
    this.activeRequests.set(fragmentId, request);
    return request;
  }

  private runAbortableRequest<T>(
    request: ActiveRequest,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const { signal } = request.controller;
      const cleanup = (): void => signal.removeEventListener("abort", handleAbort);
      const handleAbort = (): void => {
        cleanup();
        reject(new Error("Link import request was aborted"));
      };

      if (signal.aborted) {
        handleAbort();
        return;
      }

      signal.addEventListener("abort", handleAbort, { once: true });
      let operationPromise: Promise<T>;
      try {
        operationPromise = operation(signal);
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      void operationPromise.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
    });
  }

  private async startAttempt(current: ExternalLinkImport): Promise<boolean> {
    const fragmentId = current.fragmentId;
    const prepared = await prepareExternalLinkImportAttempt(
      fragmentId,
      this.timestamp(),
      this.localDependencies,
    );
    if (this.isDisposed) {
      return false;
    }
    const attemptGeneration = getExternalLinkImportAttemptGeneration(prepared);
    const submitted = await recordExternalLinkImportAttemptSubmitted(
      fragmentId,
      { attemptGeneration, now: this.timestamp() },
      this.localDependencies,
    );
    if (this.isDisposed || submitted === null) {
      return false;
    }
    const attempt = this.getAttemptIdentity(submitted);
    const request = this.createRequest(fragmentId, submitted.startedAt);

    try {
      const response = await this.runAbortableRequest(request, (signal) =>
        this.api.start(submitted.sourceUrl, signal),
      );
      request.clearDeadline();
      if (this.isDisposed) {
        return false;
      }

      if (response.status === "completed") {
        const result = await completeExternalLinkImport(
          { fragmentId, ...response, attempt, now: this.timestamp() },
          this.localDependencies,
        );
        if (!this.isDisposed && result.didFinalize) {
          this.onEvent?.({
            type: "completed",
            fragmentId,
            message: "链接内容读取完成，卡片和详情已经更新。",
          });
        }
        return false;
      }

      const started = await recordExternalLinkImportStarted(
        fragmentId,
        {
          attemptGeneration,
          taskId: response.taskId,
          requestId: response.requestId,
          now: this.timestamp(),
        },
        this.localDependencies,
      );
      return !this.isDisposed && started !== null;
    } catch (error) {
      request.clearDeadline();
      if (this.isDisposed) {
        return false;
      }
      if (request.didReachDeadline()) {
        await this.markTimedOut(submitted);
        return false;
      }
      if (request.controller.signal.aborted) {
        return false;
      }

      const normalized = this.normalizeError(error);
      await this.markFailed(submitted, normalized.code, normalized.message, normalized.requestId);
      return false;
    }
  }

  private async poll(current: ExternalLinkImport): Promise<boolean> {
    const fragmentId = current.fragmentId;
    const taskId = current.taskId;
    if (taskId === null) {
      return false;
    }
    const attempt = this.getAttemptIdentity(current);
    const request = this.createRequest(fragmentId, current.startedAt);

    try {
      const response = await this.runAbortableRequest(request, (signal) =>
        this.api.getProgress(taskId, signal),
      );
      request.clearDeadline();
      if (this.isDisposed) {
        return false;
      }
      const didRecordPoll = await recordExternalLinkImportPolled(
        fragmentId,
        {
          attemptGeneration: attempt.attemptGeneration,
          taskId,
          requestId: response.requestId,
          now: this.timestamp(),
        },
        this.localDependencies,
      );
      if (this.isDisposed || !didRecordPoll) {
        return false;
      }

      if (response.status === "completed") {
        const result = await completeExternalLinkImport(
          { fragmentId, ...response, attempt, now: this.timestamp() },
          this.localDependencies,
        );
        if (!this.isDisposed && result.didFinalize) {
          this.onEvent?.({
            type: "completed",
            fragmentId,
            message: "链接内容读取完成，卡片和详情已经更新。",
          });
        }
        return false;
      }

      return this.wait(
        fragmentId,
        Math.min(this.pollIntervalMs, this.getRemainingProcessingDuration(current.startedAt)),
        "poll",
      );
    } catch (error) {
      request.clearDeadline();
      if (this.isDisposed) {
        return false;
      }
      if (request.didReachDeadline()) {
        await this.markTimedOut(current);
        return false;
      }
      if (request.controller.signal.aborted) {
        return false;
      }

      const normalized = this.normalizeError(error);
      const didRecordPoll = await recordExternalLinkImportPolled(
        fragmentId,
        {
          attemptGeneration: attempt.attemptGeneration,
          taskId,
          requestId: normalized.requestId,
          now: this.timestamp(),
        },
        this.localDependencies,
      );
      if (this.isDisposed || !didRecordPoll) {
        return false;
      }
      if (normalized.code === "provider_processing_failed" && current.attemptCount < 2) {
        const retry = await prepareExternalLinkImportAutomaticRetry(
          fragmentId,
          { ...attempt, now: this.timestamp() },
          this.localDependencies,
        );
        return retry !== null;
      }

      await this.markFailed(current, normalized.code, normalized.message, normalized.requestId);
      return false;
    }
  }

  private normalizeError(error: unknown): Readonly<{
    code: string;
    message: string;
    requestId: string | null;
  }> {
    return error instanceof LinkImportApiClientError
      ? { code: error.code, message: error.message, requestId: error.requestId }
      : {
          code: "unknown_error",
          message: "链接读取遇到未知错误。原链接和植物仍然保留。",
          requestId: null,
        };
  }

  private async markFailed(
    externalLinkImport: ExternalLinkImport,
    errorCode: string,
    errorMessage: string,
    requestId: string | null,
  ): Promise<void> {
    const fragmentId = externalLinkImport.fragmentId;
    const result = await failExternalLinkImport(
      {
        fragmentId,
        errorCode,
        errorMessage,
        requestId,
        attempt: this.getAttemptIdentity(externalLinkImport),
        now: this.timestamp(),
      },
      this.localDependencies,
    );
    if (!this.isDisposed && result.didFinalize) {
      this.onEvent?.({
        type: "failed",
        fragmentId,
        message: "链接已经种下，但暂时没能读取完整内容。可以稍后重新读取。",
      });
    }
  }

  private markTimedOut(externalLinkImport: ExternalLinkImport): Promise<void> {
    return this.markFailed(
      externalLinkImport,
      "processing_timeout",
      "链接已经种下，但内容读取超过十分钟。你可以稍后重新读取。",
      externalLinkImport.providerRequestId,
    );
  }

  private async markUnexpectedProcessFailure(fragmentId: string): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const database = this.localDependencies.database ?? fragmentGardenDb;
    const current = await new ExternalLinkImportRepository(database).getByFragmentId(fragmentId);
    if (current === undefined || isTerminalStatus(current.status)) {
      return;
    }

    await this.markFailed(
      current,
      "unknown_error",
      "链接读取遇到未知错误。原链接和植物仍然保留。",
      current.providerRequestId,
    );
  }

  private wait(fragmentId: string, delayMs: number, kind: PendingWaitKind): Promise<boolean> {
    if (this.isDisposed) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingWaits.delete(fragmentId);
        resolve(!this.isDisposed);
      }, delayMs);
      this.pendingWaits.set(fragmentId, { handle: timeoutHandle, kind, resolve });
    });
  }

  private wakePendingWait(fragmentId: string): boolean {
    const pendingWait = this.pendingWaits.get(fragmentId);
    if (pendingWait === undefined || pendingWait.kind !== "offline") {
      return false;
    }

    clearTimeout(pendingWait.handle);
    this.pendingWaits.delete(fragmentId);
    pendingWait.resolve(!this.isDisposed);
    return true;
  }

  private resolveIdleWaiters(): void {
    if (this.queue.length > 0 || this.activeFragmentIds.size > 0) {
      return;
    }

    for (const resolve of this.idleWaiters) {
      resolve();
    }
    this.idleWaiters.clear();
  }
}
