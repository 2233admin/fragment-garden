import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { ExternalLinkImportRepository } from "../../../data/repositories/external-link-import-repository";
import {
  ExternalLinkImportManager,
  type ExternalLinkImportManagerEvent,
} from "../../../services/external-link-import-manager";
import type { LinkImportApi } from "../../../services/link-import-api-client";
import {
  createCompletedImportResponse,
  createDeferred,
  createLinkImportTestDatabase,
  seedLinkImport,
} from "./link-import-fixtures";

function createFakeApi() {
  return {
    start: vi.fn<LinkImportApi["start"]>(),
    getProgress: vi.fn<LinkImportApi["getProgress"]>(),
  };
}

let database: FragmentGardenDatabase;
let managers: ExternalLinkImportManager[];

beforeEach(async () => {
  database = createLinkImportTestDatabase("manager-lifecycle");
  await database.open();
  managers = [];
});

afterEach(async () => {
  for (const manager of managers) {
    manager.dispose();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function track(manager: ExternalLinkImportManager): ExternalLinkImportManager {
  managers.push(manager);
  return manager;
}

describe("ExternalLinkImportManager lifecycle", () => {
  it("resumes both pending submissions and processing polls after a refresh", async () => {
    const pending = await seedLinkImport(database, { key: "resume-pending" });
    const processing = await seedLinkImport(database, {
      key: "resume-processing",
      status: "processing",
      taskId: "persisted-processing-task",
    });
    const api = createFakeApi();
    api.start.mockResolvedValue(createCompletedImportResponse("resume-pending"));
    api.getProgress.mockResolvedValue(createCompletedImportResponse("resume-processing"));
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    await manager.resumePendingLinkImports();
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledOnce();
    expect(api.start).toHaveBeenCalledWith(pending.fragment.sourceUrl, expect.any(AbortSignal));
    expect(api.getProgress).toHaveBeenCalledOnce();
    expect(api.getProgress).toHaveBeenCalledWith(
      "persisted-processing-task",
      expect.any(AbortSignal),
    );
    await expect(
      database.externalLinkImports.get(pending.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      externalNoteId: "external-note-resume-pending",
    });
    await expect(
      database.externalLinkImports.get(processing.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      externalNoteId: "external-note-resume-processing",
    });
  });

  it("does not resume an import that is already failed", async () => {
    await seedLinkImport(database, {
      key: "failed-before-resume",
      status: "failed",
      taskId: "deleted-task",
    });
    const api = createFakeApi();
    const events: ExternalLinkImportManagerEvent[] = [];
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        onEvent: (event) => events.push(event),
      }),
    );

    await manager.resumePendingLinkImports();
    await manager.whenIdle();

    expect(api.start).not.toHaveBeenCalled();
    expect(api.getProgress).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("keeps only one active task for repeated requests of the same fragment", async () => {
    const seeded = await seedLinkImport(database, { key: "single-active" });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    const api = createFakeApi();
    api.start.mockImplementation(() => deferred.promise);
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    manager.startExternalLinkImport(seeded.fragment.id);
    manager.startExternalLinkImport(seeded.fragment.id);
    manager.startExternalLinkImport(seeded.fragment.id);
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledOnce());

    await manager.resumePendingLinkImports();
    expect(api.start).toHaveBeenCalledOnce();

    deferred.resolve(createCompletedImportResponse("single-active"));
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledOnce();
    await expect(database.externalLinkImports.count()).resolves.toBe(1);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("serializes the same pending import across manager instances", async () => {
    const seeded = await seedLinkImport(database, { key: "cross-manager-start" });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    const api = createFakeApi();
    api.start.mockImplementation(() => deferred.promise);
    const firstManager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );
    const secondManager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    firstManager.startExternalLinkImport(seeded.fragment.id);
    secondManager.startExternalLinkImport(seeded.fragment.id);
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledOnce());

    deferred.resolve(createCompletedImportResponse("cross-manager-start"));
    await Promise.all([firstManager.whenIdle(), secondManager.whenIdle()]);

    expect(api.start).toHaveBeenCalledOnce();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      attemptCount: 1,
    });
  });

  it("keeps one poller for the same processing task across manager instances", async () => {
    const seeded = await seedLinkImport(database, {
      key: "cross-manager-poll",
      status: "processing",
      taskId: "cross-manager-task",
    });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["getProgress"]>>>();
    const api = createFakeApi();
    api.getProgress.mockImplementation(() => deferred.promise);
    const firstManager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );
    const secondManager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    await Promise.all([
      firstManager.resumePendingLinkImports(),
      secondManager.resumePendingLinkImports(),
    ]);
    await vi.waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());

    deferred.resolve(createCompletedImportResponse("cross-manager-poll"));
    await Promise.all([firstManager.whenIdle(), secondManager.whenIdle()]);

    expect(api.getProgress).toHaveBeenCalledOnce();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("lets a disposed manager leave the module lock queue safely", async () => {
    const seeded = await seedLinkImport(database, { key: "disposed-lock-waiter" });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    const firstApi = createFakeApi();
    firstApi.start.mockImplementation(() => deferred.promise);
    const secondApi = createFakeApi();
    const firstManager = track(
      new ExternalLinkImportManager({
        api: firstApi,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );
    const secondManager = track(
      new ExternalLinkImportManager({
        api: secondApi,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    firstManager.startExternalLinkImport(seeded.fragment.id);
    await vi.waitFor(() => expect(firstApi.start).toHaveBeenCalledOnce());
    secondManager.startExternalLinkImport(seeded.fragment.id);
    secondManager.dispose();
    await secondManager.whenIdle();

    expect(secondApi.start).not.toHaveBeenCalled();
    deferred.resolve(createCompletedImportResponse("disposed-lock-waiter"));
    await firstManager.whenIdle();
  });

  it("runs exactly two imports concurrently and waits before starting a third", async () => {
    const first = await seedLinkImport(database, { key: "concurrency-a" });
    const second = await seedLinkImport(database, { key: "concurrency-b" });
    const third = await seedLinkImport(database, { key: "concurrency-c" });
    const deferredByUrl = new Map(
      [first, second, third].map((seeded) => [
        seeded.fragment.sourceUrl,
        createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>(),
      ]),
    );
    let activeCount = 0;
    let maximumActiveCount = 0;
    const api = createFakeApi();
    api.start.mockImplementation(async (url) => {
      const deferred = deferredByUrl.get(url);
      if (deferred === undefined) {
        throw new Error(`Unexpected URL ${url}`);
      }

      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      try {
        return await deferred.promise;
      } finally {
        activeCount -= 1;
      }
    });
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    await manager.resumePendingLinkImports();
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledTimes(2));
    expect(api.start.mock.calls.map(([url]) => url)).toEqual([
      first.fragment.sourceUrl,
      second.fragment.sourceUrl,
    ]);
    expect(activeCount).toBe(2);
    expect(maximumActiveCount).toBe(2);

    deferredByUrl
      .get(first.fragment.sourceUrl)
      ?.resolve(createCompletedImportResponse("concurrency-a"));
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledTimes(3));
    expect(api.start.mock.calls[2]?.[0]).toBe(third.fragment.sourceUrl);
    expect(activeCount).toBe(2);
    expect(maximumActiveCount).toBe(2);

    deferredByUrl
      .get(second.fragment.sourceUrl)
      ?.resolve(createCompletedImportResponse("concurrency-b"));
    deferredByUrl
      .get(third.fragment.sourceUrl)
      ?.resolve(createCompletedImportResponse("concurrency-c"));
    await manager.whenIdle();

    expect(activeCount).toBe(0);
    expect(maximumActiveCount).toBe(2);
  });

  it("waits the default ten seconds between progress polls", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const seeded = await seedLinkImport(database, {
      key: "poll-interval",
      status: "processing",
      taskId: "poll-interval-task",
    });
    const api = createFakeApi();
    api.getProgress
      .mockResolvedValueOnce({
        status: "pending",
        requestId: "poll-request-1",
      })
      .mockResolvedValueOnce(createCompletedImportResponse("poll-interval"));
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    await manager.resumePendingLinkImports();
    await vi.waitFor(() => {
      expect(api.getProgress).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(1);
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(api.getProgress).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    await manager.whenIdle();

    expect(api.getProgress).toHaveBeenCalledTimes(2);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("waits only the remaining poll interval after refresh", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const seeded = await seedLinkImport(database, {
      key: "persisted-poll-interval",
      status: "processing",
      taskId: "persisted-poll-task",
    });
    await database.externalLinkImports.update(seeded.externalLinkImport.id, {
      lastPolledAt: "2026-07-23T12:00:55.000Z",
    });
    const api = createFakeApi();
    api.getProgress.mockResolvedValue(createCompletedImportResponse("persisted-poll-interval"));
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    await manager.resumePendingLinkImports();
    await vi.waitFor(() => {
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
      expect(vi.getTimerCount()).toBe(1);
    });
    expect(api.getProgress).not.toHaveBeenCalled();

    await manager.resumePendingLinkImports();
    expect(api.getProgress).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await vi.runOnlyPendingTimersAsync();
    await manager.whenIdle();

    expect(api.getProgress).toHaveBeenCalledOnce();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({ status: "completed" });
  });

  it("pauses while offline and resumes immediately when online recovery runs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const seeded = await seedLinkImport(database, { key: "online-recovery" });
    let isOnline = false;
    const api = createFakeApi();
    api.start.mockResolvedValue(createCompletedImportResponse("online-recovery"));
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        isOnline: () => isOnline,
      }),
    );

    await manager.resumePendingLinkImports();
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    expect(api.start).not.toHaveBeenCalled();

    isOnline = true;
    await manager.resumePendingLinkImports();
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledOnce();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({ status: "completed" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not duplicate a persisted companion terminal notification after resume", async () => {
    const seeded = await seedLinkImport(database, {
      key: "notification-resume",
      status: "processing",
      initiatedBy: "companion",
      taskId: "notification-task",
    });
    const firstApi = createFakeApi();
    firstApi.getProgress.mockResolvedValue(createCompletedImportResponse("notification-resume"));
    const firstEvents: ExternalLinkImportManagerEvent[] = [];
    const firstManager = track(
      new ExternalLinkImportManager({
        api: firstApi,
        localDependencies: {
          database,
          createId: () => "persisted-terminal-message",
        },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        onEvent: (event) => firstEvents.push(event),
      }),
    );

    await firstManager.resumePendingLinkImports();
    await firstManager.whenIdle();
    firstManager.dispose();

    const resumedApi = createFakeApi();
    const resumedEvents: ExternalLinkImportManagerEvent[] = [];
    const resumedManager = track(
      new ExternalLinkImportManager({
        api: resumedApi,
        localDependencies: {
          database,
          createId: () => {
            throw new Error("Resume must not create a duplicate terminal message");
          },
        },
        now: () => new Date("2026-07-23T12:02:00.000Z"),
        onEvent: (event) => resumedEvents.push(event),
      }),
    );

    await resumedManager.resumePendingLinkImports();
    await resumedManager.whenIdle();

    expect(firstEvents.map(({ type }) => type)).toEqual(["completed"]);
    expect(resumedEvents).toEqual([]);
    expect(resumedApi.start).not.toHaveBeenCalled();
    expect(resumedApi.getProgress).not.toHaveBeenCalled();
    await expect(database.chatMessages.count()).resolves.toBe(1);
    await expect(database.chatMessages.get("persisted-terminal-message")).resolves.toMatchObject({
      fragmentId: seeded.fragment.id,
    });
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      terminalNotificationStatus: "completed",
    });
  });

  it("ignores a late poll result after a newer task generation replaces it", async () => {
    const seeded = await seedLinkImport(database, {
      key: "late-poll-generation",
      status: "processing",
      taskId: "task-1",
      attemptGeneration: 1,
    });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["getProgress"]>>>();
    const api = createFakeApi();
    api.getProgress.mockImplementation(() => deferred.promise);
    const events: ExternalLinkImportManagerEvent[] = [];
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        onEvent: (event) => events.push(event),
      }),
    );

    await manager.resumePendingLinkImports();
    await vi.waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());
    await database.externalLinkImports.update(seeded.externalLinkImport.id, {
      taskId: "task-2",
      attemptCount: 2,
      attemptGeneration: 2,
      providerRequestId: "task-2-request",
    });

    deferred.resolve(createCompletedImportResponse("late-poll-generation"));
    await manager.whenIdle();

    expect(events).toEqual([]);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "processing",
      taskId: "task-2",
      attemptGeneration: 2,
      externalNoteId: null,
      providerRequestId: "task-2-request",
    });
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toEqual(seeded.fragment);
  });

  it("does not emit completion after an active import is marked failed", async () => {
    const seeded = await seedLinkImport(database, {
      key: "failed-during-poll",
      status: "processing",
      taskId: "task-before-delete",
    });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["getProgress"]>>>();
    const api = createFakeApi();
    api.getProgress.mockImplementation(() => deferred.promise);
    const events: ExternalLinkImportManagerEvent[] = [];
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        onEvent: (event) => events.push(event),
      }),
    );

    await manager.resumePendingLinkImports();
    await vi.waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());
    await database.externalLinkImports.update(seeded.externalLinkImport.id, {
      status: "failed",
      errorCode: "fragment_deleted",
      errorMessage: "Fragment deleted",
    });

    deferred.resolve(createCompletedImportResponse("failed-during-poll"));
    await manager.whenIdle();

    expect(events).toEqual([]);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "fragment_deleted",
      externalNoteId: null,
    });
  });

  it("keeps an interrupted start pending and resumes it with a new manager", async () => {
    const seeded = await seedLinkImport(database, { key: "disposed-event" });
    const deferred = createDeferred<Awaited<ReturnType<LinkImportApi["start"]>>>();
    let requestSignal: AbortSignal | undefined;
    const api = createFakeApi();
    api.start.mockImplementation((_url, signal) => {
      requestSignal = signal;
      return deferred.promise;
    });
    const events: ExternalLinkImportManagerEvent[] = [];
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        onEvent: (event) => events.push(event),
      }),
    );

    manager.startExternalLinkImport(seeded.fragment.id);
    await vi.waitFor(() => expect(api.start).toHaveBeenCalledOnce());
    expect(requestSignal?.aborted).toBe(false);

    manager.dispose();
    const processSettled = manager.whenIdle();
    expect(requestSignal?.aborted).toBe(true);
    await processSettled;

    expect(events).toEqual([]);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "pending",
      attemptCount: 1,
      taskId: null,
      externalNoteId: null,
    });

    const resumedApi = createFakeApi();
    resumedApi.start.mockResolvedValue(createCompletedImportResponse("disposed-event-resumed"));
    const resumedManager = track(
      new ExternalLinkImportManager({
        api: resumedApi,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:02:00.000Z"),
      }),
    );
    await resumedManager.resumePendingLinkImports();
    await resumedManager.whenIdle();

    expect(resumedApi.start).toHaveBeenCalledOnce();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      attemptCount: 2,
      externalNoteId: "external-note-disposed-event-resumed",
    });

    deferred.resolve(createCompletedImportResponse("disposed-event-late"));
    await Promise.resolve();
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      title: "Provider 标题 disposed-event-resumed",
    });
  });

  it.each([
    ["initial import lookup", 1],
    ["attempt preparation", 2],
  ])("does not start an API request when disposed during %s", async (_label, delayedCall) => {
    const seeded = await seedLinkImport(database, { key: `disposed-read-${delayedCall}` });
    const lookupStarted = createDeferred<void>();
    const releaseLookup = createDeferred<void>();
    const originalGetByFragmentId = ExternalLinkImportRepository.prototype.getByFragmentId;
    let lookupCount = 0;
    vi.spyOn(ExternalLinkImportRepository.prototype, "getByFragmentId").mockImplementation(
      async function (this: ExternalLinkImportRepository, fragmentId) {
        lookupCount += 1;
        if (lookupCount === delayedCall) {
          lookupStarted.resolve(undefined);
          await releaseLookup.promise;
        }
        return originalGetByFragmentId.call(this, fragmentId);
      },
    );
    const api = createFakeApi();
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    manager.startExternalLinkImport(seeded.fragment.id);
    await lookupStarted.promise;
    manager.dispose();
    const processSettled = manager.whenIdle();
    releaseLookup.resolve(undefined);
    await processSettled;

    expect(api.start).not.toHaveBeenCalled();
    expect(api.getProgress).not.toHaveBeenCalled();
  });

  it("does not create a poll timer after disposal during poll persistence", async () => {
    const seeded = await seedLinkImport(database, {
      key: "disposed-poll-persistence",
      status: "processing",
      taskId: "disposed-poll-task",
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const updateStarted = createDeferred<void>();
    const releaseUpdate = createDeferred<void>();
    const originalUpdate = ExternalLinkImportRepository.prototype.update;
    vi.spyOn(ExternalLinkImportRepository.prototype, "update").mockImplementation(async function (
      this: ExternalLinkImportRepository,
      id,
      changes,
    ) {
      updateStarted.resolve(undefined);
      await releaseUpdate.promise;
      return originalUpdate.call(this, id, changes);
    });
    const api = createFakeApi();
    api.getProgress.mockResolvedValue({
      status: "pending",
      requestId: "disposed-poll-request",
    });
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
      }),
    );

    await manager.resumePendingLinkImports();
    await updateStarted.promise;
    manager.dispose();
    const processSettled = manager.whenIdle();
    releaseUpdate.resolve(undefined);
    await processSettled;

    expect(api.getProgress).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({ status: "processing" });
  });

  it("turns unexpected process exceptions into a generic recoverable failure", async () => {
    const seeded = await seedLinkImport(database, { key: "unexpected-process-error" });
    const privateErrorText = "private fragment body must not be persisted";
    const api = createFakeApi();
    const events: ExternalLinkImportManagerEvent[] = [];
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:01:00.000Z"),
        isOnline: () => {
          throw new Error(privateErrorText);
        },
        onEvent: (event) => events.push(event),
      }),
    );

    manager.startExternalLinkImport(seeded.fragment.id);
    await manager.whenIdle();

    expect(api.start).not.toHaveBeenCalled();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "unknown_error",
      errorMessage: "链接读取遇到未知错误。原链接和植物仍然保留。",
    });
    expect(events).toEqual([
      {
        type: "failed",
        fragmentId: seeded.fragment.id,
        message: "链接已经种下，但暂时没能读取完整内容。可以稍后重新读取。",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain(privateErrorText);
  });
});
