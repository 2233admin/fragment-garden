import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import {
  prepareExternalLinkImportAttempt,
  prepareExternalLinkImportAutomaticRetry,
  recordExternalLinkImportAttemptSubmitted,
  recordExternalLinkImportPolled,
  recordExternalLinkImportStarted,
  resetExternalLinkImportForManualRetry,
} from "../../../services/external-link-import-state";
import { createLinkImportTestDatabase, seedLinkImport } from "./link-import-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createLinkImportTestDatabase("state");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("external link import state transitions", () => {
  it("does not consume an attempt for repeated local preparation before submission", async () => {
    const seeded = await seedLinkImport(database, { key: "prepare-interruptions" });

    const first = await prepareExternalLinkImportAttempt(
      seeded.fragment.id,
      "2026-07-23T12:00:10.000Z",
      { database },
    );
    const second = await prepareExternalLinkImportAttempt(
      seeded.fragment.id,
      "2026-07-23T12:00:20.000Z",
      { database },
    );
    const third = await prepareExternalLinkImportAttempt(
      seeded.fragment.id,
      "2026-07-23T12:00:30.000Z",
      { database },
    );

    expect([first, second, third].map(({ attemptGeneration }) => attemptGeneration)).toEqual([
      1, 2, 3,
    ]);
    expect(third).toMatchObject({
      status: "pending",
      attemptCount: 0,
      startedAt: null,
    });

    const submitted = await recordExternalLinkImportAttemptSubmitted(
      seeded.fragment.id,
      {
        attemptGeneration: third.attemptGeneration,
        now: "2026-07-23T12:00:40.000Z",
      },
      { database },
    );
    expect(submitted).toMatchObject({
      attemptCount: 1,
      attemptGeneration: 3,
      startedAt: "2026-07-23T12:00:40.000Z",
    });
  });

  it("records one prepared attempt, task submission and poll without losing request IDs", async () => {
    const seeded = await seedLinkImport(database);

    const prepared = await prepareExternalLinkImportAttempt(
      seeded.fragment.id,
      "2026-07-23T12:01:00.000Z",
      { database },
    );
    expect(prepared).toMatchObject({
      status: "pending",
      attemptCount: 0,
      attemptGeneration: 1,
      taskId: null,
    });
    await recordExternalLinkImportAttemptSubmitted(
      seeded.fragment.id,
      {
        attemptGeneration: 1,
        now: "2026-07-23T12:01:30.000Z",
      },
      { database },
    );
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      attemptCount: 1,
      startedAt: "2026-07-23T12:01:30.000Z",
    });

    await recordExternalLinkImportStarted(
      seeded.fragment.id,
      {
        attemptGeneration: 1,
        taskId: "task-1",
        requestId: "start-request",
        now: "2026-07-23T12:02:00.000Z",
      },
      { database },
    );
    await recordExternalLinkImportPolled(
      seeded.fragment.id,
      {
        attemptGeneration: 1,
        taskId: "task-1",
        requestId: null,
        now: "2026-07-23T12:03:00.000Z",
      },
      { database },
    );

    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "processing",
      attemptCount: 1,
      taskId: "task-1",
      providerRequestId: "start-request",
      lastPolledAt: "2026-07-23T12:03:00.000Z",
    });
  });

  it("allows exactly one automatic resubmission", async () => {
    const seeded = await seedLinkImport(database);

    await prepareExternalLinkImportAttempt(seeded.fragment.id, "2026-07-23T12:01:00.000Z", {
      database,
    });
    await recordExternalLinkImportAttemptSubmitted(
      seeded.fragment.id,
      { attemptGeneration: 1, now: "2026-07-23T12:01:15.000Z" },
      { database },
    );
    await recordExternalLinkImportStarted(
      seeded.fragment.id,
      {
        attemptGeneration: 1,
        taskId: "task-attempt-1",
        requestId: "request-attempt-1",
        now: "2026-07-23T12:01:30.000Z",
      },
      { database },
    );
    const pendingRetry = await prepareExternalLinkImportAutomaticRetry(
      seeded.fragment.id,
      {
        attemptGeneration: 1,
        taskId: "task-attempt-1",
        now: "2026-07-23T12:02:00.000Z",
      },
      { database },
    );
    expect(pendingRetry).toMatchObject({
      status: "pending",
      attemptCount: 1,
      taskId: null,
    });

    const secondAttempt = await prepareExternalLinkImportAttempt(
      seeded.fragment.id,
      "2026-07-23T12:03:00.000Z",
      { database },
    );
    expect(secondAttempt).toMatchObject({
      attemptCount: 1,
      attemptGeneration: 2,
    });
    await recordExternalLinkImportAttemptSubmitted(
      seeded.fragment.id,
      { attemptGeneration: 2, now: "2026-07-23T12:03:15.000Z" },
      { database },
    );
    await recordExternalLinkImportStarted(
      seeded.fragment.id,
      {
        attemptGeneration: 2,
        taskId: "task-attempt-2",
        requestId: "request-attempt-2",
        now: "2026-07-23T12:03:30.000Z",
      },
      { database },
    );
    await expect(
      prepareExternalLinkImportAutomaticRetry(
        seeded.fragment.id,
        {
          attemptGeneration: 2,
          taskId: "task-attempt-2",
          now: "2026-07-23T12:04:00.000Z",
        },
        { database },
      ),
    ).rejects.toThrow("cannot be retried automatically");
  });

  it("resets a failed import and Fragment for an explicit manual retry", async () => {
    const seeded = await seedLinkImport(database, {
      status: "failed",
      attemptCount: 2,
      terminalNotificationStatus: "failed",
    });
    await database.externalLinkImports.update(seeded.externalLinkImport.id, {
      taskId: "old-task",
      externalNoteId: "old-note",
      providerRequestId: "old-request",
      lastPolledAt: "2026-07-23T12:04:00.000Z",
      completedAt: "2026-07-23T12:04:00.000Z",
    });

    const reset = await resetExternalLinkImportForManualRetry(
      seeded.fragment.id,
      "2026-07-23T12:05:00.000Z",
      { database },
    );

    expect(reset.externalLinkImport).toMatchObject({
      status: "pending",
      attemptCount: 0,
      attemptGeneration: 3,
      taskId: null,
      externalNoteId: null,
      providerRequestId: null,
      errorCode: null,
      errorMessage: null,
      terminalNotificationStatus: null,
      startedAt: null,
      lastPolledAt: null,
      completedAt: null,
    });
    expect(reset.fragment.analysisStatus).toBe("pending");
  });
});
