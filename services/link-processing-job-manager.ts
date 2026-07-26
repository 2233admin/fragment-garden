import { LinkNoteContentError, type ContentProcessingJob } from "../domain";
import { fragmentGardenDb } from "../data/db";
import { ContentProcessingJobRepository } from "../data/repositories/content-processing-job-repository";
import {
  cancelContentProcessingJob,
  deleteContentProcessingJob,
} from "./content-processing-job-lifecycle";
import { completeLinkProcessingJob, failLinkProcessingJob } from "./finalize-link-processing-job";
import {
  getLinkProcessingJobAttemptGeneration,
  prepareLinkProcessingJobAttempt,
  prepareLinkProcessingJobAutomaticRetry,
  recordLinkProcessingJobAttemptSubmitted,
  recordLinkProcessingJobPolled,
  recordLinkProcessingJobStarted,
  resetLinkProcessingJobForManualRetry,
  type LinkProcessingJobAttemptIdentity,
} from "./link-processing-job-state";
import {
  LinkImportApiClient,
  LinkImportApiClientError,
  type LinkImportApi,
} from "./link-import-api-client";
import type { LocalServiceDependencies } from "./local-service-dependencies";

export const LINK_PROCESSING_JOB_POLL_INTERVAL_MS = 10_000;
export const LINK_PROCESSING_JOB_MAX_DURATION_MS = 10 * 60 * 1000;
export const LINK_PROCESSING_JOB_MAX_CONCURRENCY = 2;

export type LinkProcessingJobManagerEvent = Readonly<{
  type: "completed" | "failed";
  jobId: string;
  fragmentId: string | null;
  message: string;
}>;

export type LinkProcessingJobManagerOptions = Readonly<{
  api?: LinkImportApi;
  localDependencies?: Pick<LocalServiceDependencies, "database" | "createId">;
  now?: () => Date;
  isOnline?: () => boolean;
  pollIntervalMs?: number;
  maxDurationMs?: number;
  maxConcurrency?: number;
  onEvent?: (event: LinkProcessingJobManagerEvent) => void;
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
type ModuleLockState = { isLocked: boolean; waiters: ModuleLockWaiter[] };

const MODULE_JOB_LOCKS = new Map<string, ModuleLockState>();

function createModuleLockRelease(lockName: string, state: ModuleLockState): ModuleLockRelease {
  let didRelease = false;

  return () => {
    if (didRelease) return;
    didRelease = true;

    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift();
      if (waiter === undefined) break;
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) {
        waiter.resolve(null);
        continue;
      }
      waiter.resolve(createModuleLockRelease(lockName, state));
      return;
    }

    state.isLocked = false;
    if (MODULE_JOB_LOCKS.get(lockName) === state) {
      MODULE_JOB_LOCKS.delete(lockName);
    }
  };
}

function acquireModuleJobLock(
  lockName: string,
  signal: AbortSignal,
): Promise<ModuleLockRelease | null> {
  if (signal.aborted) return Promise.resolve(null);

  const state = MODULE_JOB_LOCKS.get(lockName) ?? { isLocked: false, waiters: [] };
  MODULE_JOB_LOCKS.set(lockName, state);
  if (!state.isLocked) {
    state.isLocked = true;
    return Promise.resolve(createModuleLockRelease(lockName, state));
  }

  return new Promise((resolve) => {
    const waiter: ModuleLockWaiter = {
      signal,
      onAbort: () => {
        const index = state.waiters.indexOf(waiter);
        if (index >= 0) state.waiters.splice(index, 1);
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

function isTerminalStatus(status: ContentProcessingJob["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export class LinkProcessingJobManager {
  private readonly api: LinkImportApi;
  private readonly localDependencies: Pick<LocalServiceDependencies, "database" | "createId">;
  private readonly now: () => Date;
  private readonly isOnline: () => boolean;
  private readonly pollIntervalMs: number;
  private readonly maxDurationMs: number;
  private readonly maxConcurrency: number;
  private readonly onEvent?: (event: LinkProcessingJobManagerEvent) => void;
  private readonly queuedJobIds = new Set<string>();
  private readonly activeJobIds = new Set<string>();
  private readonly queue: string[] = [];
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly pendingLockRequests = new Map<string, AbortController>();
  private readonly pendingWaits = new Map<string, PendingWait>();
  private readonly idleWaiters = new Set<() => void>();
  private isDisposed = false;

  constructor(options: LinkProcessingJobManagerOptions = {}) {
    this.api = options.api ?? new LinkImportApiClient();
    this.localDependencies = options.localDependencies ?? {};
    this.now = options.now ?? (() => new Date());
    this.isOnline =
      options.isOnline ??
      (() =>
        typeof navigator === "undefined" || typeof navigator.onLine !== "boolean"
          ? true
          : navigator.onLine);
    this.pollIntervalMs = options.pollIntervalMs ?? LINK_PROCESSING_JOB_POLL_INTERVAL_MS;
    this.maxDurationMs = options.maxDurationMs ?? LINK_PROCESSING_JOB_MAX_DURATION_MS;
    this.maxConcurrency = options.maxConcurrency ?? LINK_PROCESSING_JOB_MAX_CONCURRENCY;
    this.onEvent = options.onEvent;
  }

  start(jobId: string): void {
    this.enqueue(jobId);
  }

  startLinkProcessingJob(jobId: string): void {
    this.start(jobId);
  }

  async retry(jobId: string): Promise<void> {
    await resetLinkProcessingJobForManualRetry(jobId, this.timestamp(), this.localDependencies);
    this.enqueue(jobId, true);
  }

  retryLinkProcessingJob(jobId: string): Promise<void> {
    return this.retry(jobId);
  }

  async cancel(jobId: string): Promise<void> {
    this.stopJobWork(jobId);
    await cancelContentProcessingJob(jobId, this.timestamp(), this.localDependencies);
  }

  cancelLinkProcessingJob(jobId: string): Promise<void> {
    return this.cancel(jobId);
  }

  async delete(jobId: string): Promise<void> {
    this.stopJobWork(jobId);
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const current = await new ContentProcessingJobRepository(database).getById(jobId);
    if (
      current !== undefined &&
      current.status !== "failed" &&
      current.status !== "cancelled" &&
      current.status !== "completed"
    ) {
      await cancelContentProcessingJob(jobId, this.timestamp(), this.localDependencies);
    }
    await deleteContentProcessingJob(jobId, this.localDependencies);
  }

  deleteLinkProcessingJob(jobId: string): Promise<void> {
    return this.delete(jobId);
  }

  async resumePendingJobs(): Promise<void> {
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const jobs = await new ContentProcessingJobRepository(database).listByKindAndStatuses("link", [
      "pending",
      "processing",
    ]);
    for (const job of jobs) {
      if (!this.wakePendingWait(job.id)) this.enqueue(job.id);
    }
  }

  resumePendingLinkProcessingJobs(): Promise<void> {
    return this.resumePendingJobs();
  }

  whenIdle(): Promise<void> {
    if (this.queue.length === 0 && this.activeJobIds.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  dispose(): void {
    this.isDisposed = true;
    this.queue.length = 0;
    this.queuedJobIds.clear();
    for (const request of this.activeRequests.values()) {
      request.clearDeadline();
      request.controller.abort();
    }
    for (const controller of this.pendingLockRequests.values()) controller.abort();
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

  private getAttemptIdentity(job: ContentProcessingJob): LinkProcessingJobAttemptIdentity {
    return {
      attemptGeneration: getLinkProcessingJobAttemptGeneration(job),
      providerTaskId: job.providerTaskId,
    };
  }

  private enqueue(jobId: string, shouldQueueAfterActive = false): void {
    if (this.isDisposed || this.queuedJobIds.has(jobId)) return;
    if (this.activeJobIds.has(jobId) && !shouldQueueAfterActive) return;

    this.queue.push(jobId);
    this.queuedJobIds.add(jobId);
    this.pump();
  }

  private stopJobWork(jobId: string): void {
    const queueIndex = this.queue.indexOf(jobId);
    if (queueIndex >= 0) this.queue.splice(queueIndex, 1);
    this.queuedJobIds.delete(jobId);
    const request = this.activeRequests.get(jobId);
    request?.clearDeadline();
    request?.controller.abort();
    this.pendingLockRequests.get(jobId)?.abort();
    const pending = this.pendingWaits.get(jobId);
    if (pending !== undefined) {
      clearTimeout(pending.handle);
      this.pendingWaits.delete(jobId);
      pending.resolve(false);
    }
  }

  private pump(): void {
    while (
      !this.isDisposed &&
      this.activeJobIds.size < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const jobId = this.queue.shift();
      if (jobId === undefined) break;
      this.queuedJobIds.delete(jobId);
      this.activeJobIds.add(jobId);
      void this.processSafely(jobId);
    }
  }

  private async processSafely(jobId: string): Promise<void> {
    try {
      await this.processWithExclusiveLock(jobId);
    } catch {
      await this.markUnexpectedProcessFailure(jobId).catch(() => undefined);
    } finally {
      this.activeRequests.get(jobId)?.clearDeadline();
      this.activeRequests.delete(jobId);
      this.activeJobIds.delete(jobId);
      this.pump();
      this.resolveIdleWaiters();
    }
  }

  private async processWithExclusiveLock(jobId: string): Promise<void> {
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const lockName = `fragment-garden:content-processing:link:${database.name}:${jobId}`;
    const controller = new AbortController();
    this.pendingLockRequests.set(jobId, controller);

    try {
      const webLocks = getWebLockManager();
      if (webLocks !== null) {
        try {
          await webLocks.request(
            lockName,
            { mode: "exclusive", signal: controller.signal },
            async () => {
              if (!this.isDisposed) await this.process(jobId);
            },
          );
        } catch (error) {
          if (!controller.signal.aborted) throw error;
        }
        return;
      }

      const release = await acquireModuleJobLock(lockName, controller.signal);
      if (release === null) return;
      try {
        if (!this.isDisposed) await this.process(jobId);
      } finally {
        release();
      }
    } finally {
      if (this.pendingLockRequests.get(jobId) === controller) {
        this.pendingLockRequests.delete(jobId);
      }
    }
  }

  private async process(jobId: string): Promise<void> {
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const repository = new ContentProcessingJobRepository(database);
    let shouldRespectPersistedPollSchedule = true;

    while (!this.isDisposed) {
      const current = await repository.getById(jobId);
      if (this.isDisposed || current === undefined || current.kind !== "link") return;
      if (isTerminalStatus(current.status)) return;
      if (this.hasTimedOut(current)) {
        await this.markTimedOut(current);
        return;
      }

      if (!this.isOnline()) {
        const duration = Math.min(
          this.pollIntervalMs,
          this.getRemainingProcessingDuration(current.startedAt),
        );
        if (!(await this.wait(jobId, duration, "offline"))) return;
        continue;
      }

      if (current.status === "pending") {
        if (!(await this.startAttempt(current))) return;
        continue;
      }
      if (current.status !== "processing") return;
      if (current.providerTaskId === null) {
        await this.markFailed(
          current,
          "unknown_error",
          "上次读取在保存任务编号前中断。为避免重复创建远端笔记，请手动重试。",
          current.processingRequestId,
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
          if (!(await this.wait(jobId, remainingDelay, "poll"))) return;
          continue;
        }
      }
      if (!(await this.poll(current))) return;
    }
  }

  private hasTimedOut(job: ContentProcessingJob): boolean {
    if (job.startedAt === null) return false;
    const startedAt = Date.parse(job.startedAt);
    return Number.isFinite(startedAt) && this.now().getTime() - startedAt >= this.maxDurationMs;
  }

  private getRemainingPollDelay(lastPolledAt: string | null): number {
    if (lastPolledAt === null) return 0;
    const timestamp = Date.parse(lastPolledAt);
    if (!Number.isFinite(timestamp)) return 0;
    return Math.max(
      0,
      Math.min(this.pollIntervalMs, timestamp + this.pollIntervalMs - this.now().getTime()),
    );
  }

  private getRemainingProcessingDuration(startedAt: string | null): number {
    if (startedAt === null) return this.maxDurationMs;
    const timestamp = Date.parse(startedAt);
    if (!Number.isFinite(timestamp)) return this.maxDurationMs;
    return Math.max(
      0,
      Math.min(this.maxDurationMs, timestamp + this.maxDurationMs - this.now().getTime()),
    );
  }

  private createRequest(jobId: string, startedAt: string | null): ActiveRequest {
    const previous = this.activeRequests.get(jobId);
    previous?.clearDeadline();
    previous?.controller.abort();

    const controller = new AbortController();
    let didReachDeadline = false;
    let deadline: TimeoutHandle | null = null;
    const clearDeadline = (): void => {
      if (deadline !== null) {
        clearTimeout(deadline);
        deadline = null;
      }
    };
    const remainingDuration = this.getRemainingProcessingDuration(startedAt);
    if (remainingDuration === 0) {
      didReachDeadline = true;
      controller.abort();
    } else {
      deadline = setTimeout(() => {
        deadline = null;
        didReachDeadline = true;
        controller.abort();
      }, remainingDuration);
    }

    const request: ActiveRequest = {
      controller,
      clearDeadline,
      didReachDeadline: () => didReachDeadline,
    };
    this.activeRequests.set(jobId, request);
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
        reject(new Error("Link processing request was aborted"));
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

  private async startAttempt(current: ContentProcessingJob): Promise<boolean> {
    const prepared = await prepareLinkProcessingJobAttempt(
      current.id,
      this.timestamp(),
      this.localDependencies,
    );
    if (this.isDisposed) return false;
    const attemptGeneration = getLinkProcessingJobAttemptGeneration(prepared);
    const submitted = await recordLinkProcessingJobAttemptSubmitted(
      current.id,
      { attemptGeneration, now: this.timestamp() },
      this.localDependencies,
    );
    if (this.isDisposed || submitted === null || submitted.sourceUrl === null) return false;

    const attempt = this.getAttemptIdentity(submitted);
    const request = this.createRequest(current.id, submitted.startedAt);
    try {
      const response = await this.runAbortableRequest(request, (signal) =>
        this.api.start(submitted.sourceUrl as string, signal),
      );
      request.clearDeadline();
      if (this.isDisposed) return false;

      if (response.status === "completed") {
        const result = await completeLinkProcessingJob(
          { jobId: current.id, ...response, attempt, now: this.timestamp() },
          this.localDependencies,
        );
        if (result.didFinalize && !this.isDisposed) {
          this.onEvent?.({
            type: "completed",
            jobId: current.id,
            fragmentId: result.fragment?.id ?? null,
            message: "新笔记已经整理好了。",
          });
        }
        return false;
      }

      const started = await recordLinkProcessingJobStarted(
        current.id,
        {
          attemptGeneration,
          providerTaskId: response.taskId,
          requestId: response.requestId,
          now: this.timestamp(),
        },
        this.localDependencies,
      );
      return !this.isDisposed && started !== null;
    } catch (error) {
      request.clearDeadline();
      if (this.isDisposed) return false;
      if (request.didReachDeadline()) {
        await this.markTimedOut(submitted);
        return false;
      }
      if (request.controller.signal.aborted) return false;

      const normalized = this.normalizeError(error);
      await this.markFailed(submitted, normalized.code, normalized.message, normalized.requestId);
      return false;
    }
  }

  private async poll(current: ContentProcessingJob): Promise<boolean> {
    const providerTaskId = current.providerTaskId;
    if (providerTaskId === null) return false;
    const attempt = this.getAttemptIdentity(current);
    const request = this.createRequest(current.id, current.startedAt);

    try {
      const response = await this.runAbortableRequest(request, (signal) =>
        this.api.getProgress(providerTaskId, signal),
      );
      request.clearDeadline();
      if (this.isDisposed) return false;
      const didRecordPoll = await recordLinkProcessingJobPolled(
        current.id,
        { ...attempt, requestId: response.requestId, now: this.timestamp() },
        this.localDependencies,
      );
      if (this.isDisposed || !didRecordPoll) return false;

      if (response.status === "completed") {
        const result = await completeLinkProcessingJob(
          { jobId: current.id, ...response, attempt, now: this.timestamp() },
          this.localDependencies,
        );
        if (result.didFinalize && !this.isDisposed) {
          this.onEvent?.({
            type: "completed",
            jobId: current.id,
            fragmentId: result.fragment?.id ?? null,
            message: "新笔记已经整理好了。",
          });
        }
        return false;
      }

      return this.wait(
        current.id,
        Math.min(this.pollIntervalMs, this.getRemainingProcessingDuration(current.startedAt)),
        "poll",
      );
    } catch (error) {
      request.clearDeadline();
      if (this.isDisposed) return false;
      if (request.didReachDeadline()) {
        await this.markTimedOut(current);
        return false;
      }
      if (request.controller.signal.aborted) return false;

      const normalized = this.normalizeError(error);
      const didRecordPoll = await recordLinkProcessingJobPolled(
        current.id,
        { ...attempt, requestId: normalized.requestId, now: this.timestamp() },
        this.localDependencies,
      );
      if (this.isDisposed || !didRecordPoll) return false;
      if (normalized.code === "provider_processing_failed" && current.attemptCount < 2) {
        const retry = await prepareLinkProcessingJobAutomaticRetry(
          current.id,
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
    if (error instanceof LinkNoteContentError) {
      return { code: error.code, message: error.message, requestId: null };
    }
    if (error instanceof LinkImportApiClientError) {
      return { code: error.code, message: error.message, requestId: error.requestId };
    }
    return {
      code: "unknown_error",
      message: "链接整理遇到未知错误。处理任务仍然保留，可以稍后重试。",
      requestId: null,
    };
  }

  private async markFailed(
    job: ContentProcessingJob,
    errorCode: string,
    errorMessage: string,
    requestId: string | null,
  ): Promise<void> {
    const result = await failLinkProcessingJob(
      {
        jobId: job.id,
        errorCode,
        errorMessage,
        requestId,
        attempt: this.getAttemptIdentity(job),
        now: this.timestamp(),
      },
      this.localDependencies,
    );
    if (result.didFinalize && !this.isDisposed) {
      this.onEvent?.({
        type: "failed",
        jobId: job.id,
        fragmentId: null,
        message: "暂时没能整理这条链接。任务已经保留，可以稍后重试。",
      });
    }
  }

  private markTimedOut(job: ContentProcessingJob): Promise<void> {
    return this.markFailed(
      job,
      "processing_timeout",
      "链接整理超过十分钟。任务已经保留，可以稍后重试。",
      job.processingRequestId,
    );
  }

  private async markUnexpectedProcessFailure(jobId: string): Promise<void> {
    if (this.isDisposed) return;
    const database = this.localDependencies.database ?? fragmentGardenDb;
    const current = await new ContentProcessingJobRepository(database).getById(jobId);
    if (current === undefined || current.kind !== "link" || isTerminalStatus(current.status))
      return;
    await this.markFailed(
      current,
      "unknown_error",
      "链接整理遇到未知错误。处理任务仍然保留，可以稍后重试。",
      current.processingRequestId,
    );
  }

  private wait(jobId: string, delayMs: number, kind: PendingWaitKind): Promise<boolean> {
    if (this.isDisposed) return Promise.resolve(false);
    return new Promise((resolve) => {
      const handle = setTimeout(() => {
        this.pendingWaits.delete(jobId);
        resolve(!this.isDisposed);
      }, delayMs);
      this.pendingWaits.set(jobId, { handle, kind, resolve });
    });
  }

  private wakePendingWait(jobId: string): boolean {
    const pending = this.pendingWaits.get(jobId);
    if (pending === undefined || pending.kind !== "offline") return false;
    clearTimeout(pending.handle);
    this.pendingWaits.delete(jobId);
    pending.resolve(!this.isDisposed);
    return true;
  }

  private resolveIdleWaiters(): void {
    if (this.queue.length > 0 || this.activeJobIds.size > 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
  }
}
