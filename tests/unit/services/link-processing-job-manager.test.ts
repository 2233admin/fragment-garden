import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentProcessingJobRepository } from "../../../data/repositories/content-processing-job-repository";
import {
  cancelContentProcessingJob,
  deleteContentProcessingJob,
} from "../../../services/content-processing-job-lifecycle";
import { LinkProcessingJobManager } from "../../../services/link-processing-job-manager";
import type { LinkImportApi } from "../../../services/link-import-api-client";
import {
  PROCESSING_JOB_TEST_NOW,
  createCompletedJobImportResponse,
  createContentProcessingJobDatabase,
  createDeferred,
  createLinkProcessingJobRecord,
} from "./content-processing-job-fixtures";

function createFakeApi() {
  return {
    start: vi.fn<LinkImportApi["start"]>(),
    getProgress: vi.fn<LinkImportApi["getProgress"]>(),
  };
}

let database = createContentProcessingJobDatabase("manager-placeholder");
let managers: LinkProcessingJobManager[] = [];

beforeEach(async () => {
  database = createContentProcessingJobDatabase("manager");
  await database.open();
  managers = [];
});

afterEach(async () => {
  for (const manager of managers) manager.dispose();
  vi.restoreAllMocks();
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

function track(manager: LinkProcessingJobManager): LinkProcessingJobManager {
  managers.push(manager);
  return manager;
}

describe("LinkProcessingJobManager", () => {
  it("resumes pending starts and persisted provider tasks without duplicating start", async () => {
    const pending = createLinkProcessingJobRecord({ id: "job-pending" });
    const processing = createLinkProcessingJobRecord({
      id: "job-processing",
      status: "processing",
      sourceUrl: "https://example.com/processing",
      normalizedSourceUrl: "https://example.com/processing",
      providerTaskId: "persisted-provider-task",
    });
    await database.contentProcessingJobs.bulkAdd([pending, processing]);
    const api = createFakeApi();
    api.start.mockResolvedValue(createCompletedJobImportResponse("pending"));
    api.getProgress.mockResolvedValue(createCompletedJobImportResponse("processing"));
    const manager = track(
      new LinkProcessingJobManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-26T08:01:00.000Z"),
        pollIntervalMs: 0,
      }),
    );

    await manager.resumePendingJobs();
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledOnce();
    expect(api.start).toHaveBeenCalledWith(pending.sourceUrl, expect.any(AbortSignal));
    expect(api.getProgress).toHaveBeenCalledOnce();
    expect(api.getProgress).toHaveBeenCalledWith(
      "persisted-provider-task",
      expect.any(AbortSignal),
    );
    await expect(database.contentProcessingJobs.get(pending.id)).resolves.toMatchObject({
      status: "completed",
      createdFragmentId: expect.any(String),
    });
    await expect(database.contentProcessingJobs.get(processing.id)).resolves.toMatchObject({
      status: "completed",
      createdFragmentId: expect.any(String),
    });
    await expect(database.fragments.count()).resolves.toBe(2);
    await expect(database.plants.count()).resolves.toBe(2);
  });

  it("persists providerTaskId so a refreshed manager only polls", async () => {
    const job = createLinkProcessingJobRecord({ id: "job-refresh" });
    await database.contentProcessingJobs.add(job);
    const firstApi = createFakeApi();
    const neverCompletes = createDeferred<Awaited<ReturnType<LinkImportApi["getProgress"]>>>();
    firstApi.start.mockResolvedValue({
      status: "pending",
      taskId: "persisted-after-start",
      requestId: "start-request",
    });
    firstApi.getProgress.mockImplementation(() => neverCompletes.promise);
    const firstManager = track(
      new LinkProcessingJobManager({
        api: firstApi,
        localDependencies: { database },
        now: () => new Date("2026-07-26T08:01:00.000Z"),
        pollIntervalMs: 0,
      }),
    );
    firstManager.start(job.id);
    await vi.waitFor(async () => {
      await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
        status: "processing",
        providerTaskId: "persisted-after-start",
      });
    });
    firstManager.dispose();

    const resumedApi = createFakeApi();
    resumedApi.getProgress.mockResolvedValue(createCompletedJobImportResponse("resumed"));
    const resumedManager = track(
      new LinkProcessingJobManager({
        api: resumedApi,
        localDependencies: { database },
        now: () => new Date("2026-07-26T08:02:00.000Z"),
        pollIntervalMs: 0,
      }),
    );
    await resumedManager.resumePendingJobs();
    await resumedManager.whenIdle();

    expect(resumedApi.start).not.toHaveBeenCalled();
    expect(resumedApi.getProgress).toHaveBeenCalledWith(
      "persisted-after-start",
      expect.any(AbortSignal),
    );
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "completed",
    });
  });

  it("persists an in-flight provider start before fetch and requires manual retry after refresh", async () => {
    const job = createLinkProcessingJobRecord({ id: "job-start-interrupted" });
    await database.contentProcessingJobs.add(job);
    const deferredStart = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    const firstApi = createFakeApi();
    firstApi.start.mockImplementation(() => deferredStart.promise);
    const firstManager = track(
      new LinkProcessingJobManager({ api: firstApi, localDependencies: { database } }),
    );

    firstManager.start(job.id);
    await vi.waitFor(() => expect(firstApi.start).toHaveBeenCalledOnce());
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "processing",
      providerTaskId: null,
      attemptCount: 1,
    });
    firstManager.dispose();

    const resumedApi = createFakeApi();
    resumedApi.start.mockResolvedValue(createCompletedJobImportResponse("manual-retry"));
    const resumedManager = track(
      new LinkProcessingJobManager({ api: resumedApi, localDependencies: { database } }),
    );
    await resumedManager.resumePendingJobs();
    await resumedManager.whenIdle();

    expect(resumedApi.start).not.toHaveBeenCalled();
    expect(resumedApi.getProgress).not.toHaveBeenCalled();
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "failed",
      errorCode: "unknown_error",
    });

    await resumedManager.retry(job.id);
    await resumedManager.whenIdle();

    expect(resumedApi.start).toHaveBeenCalledOnce();
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "completed",
      createdFragmentId: expect.any(String),
    });
    await expect(database.fragments.count()).resolves.toBe(1);
  });

  it("keeps provider failures as retryable jobs with no formal records", async () => {
    const job = createLinkProcessingJobRecord({ id: "job-failed" });
    await database.contentProcessingJobs.add(job);
    const api = createFakeApi();
    api.start.mockRejectedValue(new Error("provider unavailable"));
    const manager = track(new LinkProcessingJobManager({ api, localDependencies: { database } }));

    manager.start(job.id);
    await manager.whenIdle();

    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "failed",
      errorCode: "unknown_error",
    });
    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.externalLinkImports.count()).resolves.toBe(0);
  });

  it("retries the same failed job without creating a second job", async () => {
    const job = createLinkProcessingJobRecord({ id: "job-retry", status: "failed" });
    await database.contentProcessingJobs.add(job);
    const api = createFakeApi();
    api.start.mockResolvedValue(createCompletedJobImportResponse("retry"));
    const manager = track(new LinkProcessingJobManager({ api, localDependencies: { database } }));

    await manager.retry(job.id);
    await manager.whenIdle();

    await expect(database.contentProcessingJobs.count()).resolves.toBe(1);
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "completed",
      attemptCount: 1,
    });
    await expect(database.fragments.count()).resolves.toBe(1);
  });

  it("cancels an in-flight start and ignores its late completion", async () => {
    const job = createLinkProcessingJobRecord({ id: "job-cancel" });
    await database.contentProcessingJobs.add(job);
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    const api = createFakeApi();
    api.start.mockImplementation(() => deferred.promise);
    const manager = track(new LinkProcessingJobManager({ api, localDependencies: { database } }));
    manager.start(job.id);
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledOnce());

    await manager.cancel(job.id);
    deferred.resolve(createCompletedJobImportResponse("late"));
    await vi.waitFor(async () => {
      await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
        status: "cancelled",
      });
    });

    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
  });

  it("serializes the same job across manager instances", async () => {
    const job = createLinkProcessingJobRecord({ id: "job-multi-manager" });
    await database.contentProcessingJobs.add(job);
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    const api = createFakeApi();
    api.start.mockImplementation(() => deferred.promise);
    const first = track(new LinkProcessingJobManager({ api, localDependencies: { database } }));
    const second = track(new LinkProcessingJobManager({ api, localDependencies: { database } }));

    first.start(job.id);
    second.start(job.id);
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledOnce());
    deferred.resolve(createCompletedJobImportResponse("one-manager"));
    await Promise.all([first.whenIdle(), second.whenIdle()]);

    expect(api.start).toHaveBeenCalledOnce();
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "completed",
    });
  });
});

describe("content processing job lifecycle", () => {
  it("removes an image Blob on cancel and only deletes terminal jobs", async () => {
    const repository = new ContentProcessingJobRepository(database);
    const imageJob = createLinkProcessingJobRecord({
      id: "image-job",
      kind: "image",
      sourceUrl: null,
      normalizedSourceUrl: null,
      sourceBlob: new Blob(["private image"], { type: "image/png" }),
      sourceMimeType: "image/png",
    });
    await repository.add(imageJob);

    const cancelled = await cancelContentProcessingJob(imageJob.id, PROCESSING_JOB_TEST_NOW, {
      database,
    });
    expect(cancelled).toMatchObject({ status: "cancelled", sourceBlob: null });
    await deleteContentProcessingJob(imageJob.id, { database });
    await expect(repository.getById(imageJob.id)).resolves.toBeUndefined();
  });

  it("refuses to delete an active job directly", async () => {
    const job = createLinkProcessingJobRecord({ id: "active-job" });
    await database.contentProcessingJobs.add(job);
    await expect(deleteContentProcessingJob(job.id, { database })).rejects.toThrow(
      "must be cancelled",
    );
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toBeDefined();
  });
});
