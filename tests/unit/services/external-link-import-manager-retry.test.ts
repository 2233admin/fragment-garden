import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import {
  ExternalLinkImportManager,
  type ExternalLinkImportManagerEvent,
} from "../../../services/external-link-import-manager";
import {
  type LinkImportApi,
  LinkImportApiClientError,
} from "../../../services/link-import-api-client";
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
  database = createLinkImportTestDatabase("manager-retry");
  await database.open();
  managers = [];
});

afterEach(async () => {
  for (const manager of managers) {
    manager.dispose();
  }
  vi.useRealTimers();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function track(manager: ExternalLinkImportManager): ExternalLinkImportManager {
  managers.push(manager);
  return manager;
}

describe("ExternalLinkImportManager retry lifecycle", () => {
  it("resubmits exactly once for provider_processing_failed and stops after attempt two", async () => {
    const seeded = await seedLinkImport(database);
    const api = createFakeApi();
    api.start
      .mockResolvedValueOnce({
        status: "pending",
        taskId: "task-attempt-1",
        requestId: "start-1",
      })
      .mockResolvedValueOnce({
        status: "pending",
        taskId: "task-attempt-2",
        requestId: "start-2",
      });
    api.getProgress
      .mockRejectedValueOnce(
        new LinkImportApiClientError("provider_processing_failed", "第一次处理失败。", "failed-1"),
      )
      .mockRejectedValueOnce(
        new LinkImportApiClientError("provider_processing_failed", "第二次处理失败。", "failed-2"),
      );
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
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledTimes(2);
    expect(api.getProgress).toHaveBeenCalledTimes(2);
    expect(api.start.mock.calls.map(([url]) => url)).toEqual([
      seeded.fragment.sourceUrl,
      seeded.fragment.sourceUrl,
    ]);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      attemptCount: 2,
      taskId: "task-attempt-2",
      errorCode: "provider_processing_failed",
      errorMessage: "第二次处理失败。",
      providerRequestId: "failed-2",
    });
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      analysisStatus: "failed",
      sourceUrl: seeded.fragment.sourceUrl,
    });
    expect(events.map(({ type }) => type)).toEqual(["failed"]);
  });

  it("resets a failed import for a manual retry and completes without creating a duplicate", async () => {
    const seeded = await seedLinkImport(database, {
      key: "manual",
      status: "failed",
      attemptCount: 2,
      terminalNotificationStatus: "failed",
    });
    const api = createFakeApi();
    api.start.mockResolvedValue(createCompletedImportResponse("manual"));
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:05:00.000Z"),
      }),
    );

    await manager.retryExternalLinkImport(seeded.fragment.id);
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledTimes(1);
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.externalLinkImports.count()).resolves.toBe(1);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      attemptCount: 1,
      externalNoteId: "external-note-manual",
      errorCode: null,
      terminalNotificationStatus: null,
    });
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      analysisStatus: "completed",
      title: "Provider 标题 manual",
    });
  });

  it("does not lose an immediate manual retry requested from the failure event", async () => {
    const seeded = await seedLinkImport(database, { key: "race" });
    const api = createFakeApi();
    api.start
      .mockRejectedValueOnce(
        new LinkImportApiClientError("network_error", "第一次连接失败。", "network-request"),
      )
      .mockResolvedValueOnce(createCompletedImportResponse("race"));
    let retryPromise: Promise<void> | null = null;
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:06:00.000Z"),
        onEvent: (event) => {
          if (event.type === "failed" && retryPromise === null) {
            retryPromise = manager.retryExternalLinkImport(event.fragmentId);
          }
        },
      }),
    );

    manager.startExternalLinkImport(seeded.fragment.id);
    await vi.waitFor(() => expect(retryPromise).not.toBeNull());
    await retryPromise;
    await manager.whenIdle();

    expect(api.start).toHaveBeenCalledTimes(2);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "completed",
      attemptCount: 1,
      externalNoteId: "external-note-race",
    });
  });

  it("enforces the ten-minute wall-clock limit while network requests are paused offline", async () => {
    const seeded = await seedLinkImport(database, {
      key: "timeout",
      status: "processing",
      taskId: "task-timeout",
      startedAt: "2026-07-23T12:00:00.000Z",
    });
    const api = createFakeApi();
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date("2026-07-23T12:10:00.000Z"),
        isOnline: () => false,
      }),
    );

    await manager.resumePendingLinkImports();
    await manager.whenIdle();

    expect(api.start).not.toHaveBeenCalled();
    expect(api.getProgress).not.toHaveBeenCalled();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "processing_timeout",
      taskId: "task-timeout",
    });
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      analysisStatus: "failed",
      sourceUrl: seeded.fragment.sourceUrl,
    });
    await expect(database.plants.get(seeded.plant.id)).resolves.toBeDefined();
  });

  it("aborts an active request at the overall ten-minute deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const seeded = await seedLinkImport(database, {
      key: "active-request-timeout",
      status: "processing",
      taskId: "active-request-timeout-task",
      startedAt: "2026-07-23T12:00:00.000Z",
    });
    let nowTimestamp = Date.parse("2026-07-23T12:09:59.000Z");
    let requestSignal: AbortSignal | undefined;
    const requestStarted = createDeferred<void>();
    const lateResponse = createDeferred<Awaited<ReturnType<LinkImportApi["getProgress"]>>>();
    const api = createFakeApi();
    api.getProgress.mockImplementation((_taskId, signal) => {
      requestSignal = signal;
      requestStarted.resolve(undefined);
      return lateResponse.promise;
    });
    const manager = track(
      new ExternalLinkImportManager({
        api,
        localDependencies: { database },
        now: () => new Date(nowTimestamp),
      }),
    );

    await manager.resumePendingLinkImports();
    await requestStarted.promise;
    expect(requestSignal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(requestSignal?.aborted).toBe(false);

    nowTimestamp += 1_000;
    await vi.advanceTimersByTimeAsync(1);
    await manager.whenIdle();

    expect(requestSignal?.aborted).toBe(true);
    expect(api.getProgress).toHaveBeenCalledOnce();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "processing_timeout",
      externalNoteId: null,
    });
    expect(vi.getTimerCount()).toBe(0);

    lateResponse.resolve(createCompletedImportResponse("late-timeout-response"));
    await Promise.resolve();
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      externalNoteId: null,
    });
  });
});
