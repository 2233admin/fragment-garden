import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import {
  completeExternalLinkImport,
  failExternalLinkImport,
  LINK_IMPORT_COMPLETED_COMPANION_MESSAGE,
  LINK_IMPORT_FAILED_COMPANION_MESSAGE,
} from "../../../services/finalize-external-link-import";
import {
  createLinkImportTestDatabase,
  LINK_IMPORT_TEST_NOW,
  seedLinkImport,
} from "./link-import-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createLinkImportTestDatabase("finalize");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("external link import finalization", () => {
  it("writes content and import metadata while preserving user title, source URL, plant and growth events", async () => {
    const seeded = await seedLinkImport(database, {
      userProvidedTitle: true,
    });
    const originalPlant = await database.plants.get(seeded.plant.id);
    const originalEvents = await database.fragmentEvents
      .where("fragmentId")
      .equals(seeded.fragment.id)
      .toArray();

    const result = await completeExternalLinkImport(
      {
        fragmentId: seeded.fragment.id,
        externalNoteId: "9223372036854775807",
        title: "Provider 不得覆盖的标题",
        summary: "读取后的摘要",
        sourceContent: "读取后的完整正文",
        canonicalUrl: "https://example.com/canonical",
        truncated: true,
        requestId: "detail-request",
        attempt: {
          attemptGeneration: seeded.externalLinkImport.attemptGeneration,
          taskId: seeded.externalLinkImport.taskId,
        },
        now: "2026-07-23T12:05:00.000Z",
      },
      { database },
    );

    expect(result.fragment).toMatchObject({
      title: seeded.fragment.title,
      rawText: "读取后的完整正文",
      contentMarkdown: "读取后的完整正文\n\n读取后的摘要",
      summary: "读取后的摘要",
      sourceUrl: seeded.fragment.sourceUrl,
      analysisStatus: "completed",
    });
    expect(result.externalLinkImport).toMatchObject({
      status: "completed",
      externalNoteId: "9223372036854775807",
      canonicalUrl: "https://example.com/canonical",
      sourceContent: "读取后的完整正文",
      sourceContentTruncated: true,
      providerRequestId: "detail-request",
      completedAt: "2026-07-23T12:05:00.000Z",
    });
    await expect(database.plants.get(seeded.plant.id)).resolves.toEqual(originalPlant);
    await expect(
      database.fragmentEvents.where("fragmentId").equals(seeded.fragment.id).toArray(),
    ).resolves.toEqual(originalEvents);
    expect(result.fragment.title).toBe(seeded.fragment.title);
    expect(result.fragment.lastInteractedAt).toBe(LINK_IMPORT_TEST_NOW);
  });

  it("uses a provider title only when the user did not provide one", async () => {
    const seeded = await seedLinkImport(database, {
      key: "automatic-title",
      userProvidedTitle: false,
    });

    const result = await completeExternalLinkImport(
      {
        fragmentId: seeded.fragment.id,
        externalNoteId: "external-note",
        title: "  Provider 标题  ",
        summary: "",
        sourceContent: "",
        canonicalUrl: "https://example.com/automatic-title",
        truncated: false,
        requestId: null,
        attempt: {
          attemptGeneration: seeded.externalLinkImport.attemptGeneration,
          taskId: seeded.externalLinkImport.taskId,
        },
        now: "2026-07-23T12:05:00.000Z",
      },
      { database },
    );

    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      title: "Provider 标题",
      rawText: null,
      contentMarkdown: "Provider 标题\n\n来源链接：https://example.com/automatic-title",
      summary: null,
      analysisStatus: "completed",
    });
    expect(result.externalLinkImport.sourceContent).toBeNull();
  });

  it("preserves user-edited link content without blocking a provider title", async () => {
    const seeded = await seedLinkImport(database, {
      key: "manual-content",
      userProvidedTitle: false,
      userProvidedContent: true,
    });
    await database.fragments.update(seeded.fragment.id, {
      rawText: "用户手动保留的正文",
      contentMarkdown: "用户手动保留的正文",
    });

    const result = await completeExternalLinkImport(
      {
        fragmentId: seeded.fragment.id,
        externalNoteId: "external-note-manual-content",
        title: "Provider 新标题",
        summary: "Provider 新摘要",
        sourceContent: "Provider 不得覆盖的正文",
        canonicalUrl: "https://example.com/manual-content",
        truncated: false,
        requestId: "manual-content-request",
        attempt: {
          attemptGeneration: seeded.externalLinkImport.attemptGeneration,
          taskId: seeded.externalLinkImport.taskId,
        },
        now: "2026-07-23T12:05:00.000Z",
      },
      { database },
    );

    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      title: "Provider 新标题",
      rawText: "用户手动保留的正文",
      contentMarkdown: "用户手动保留的正文",
      summary: "Provider 新摘要",
      analysisStatus: "completed",
    });
    expect(result.externalLinkImport.sourceContent).toBe("Provider 不得覆盖的正文");
  });

  it("ignores a late completion from an older task generation", async () => {
    const seeded = await seedLinkImport(database, {
      key: "late-generation",
      status: "processing",
      taskId: "task-2",
      attemptCount: 2,
      attemptGeneration: 2,
      initiatedBy: "companion",
    });

    const result = await completeExternalLinkImport(
      {
        fragmentId: seeded.fragment.id,
        externalNoteId: "late-note",
        title: "Late task title",
        summary: "Late task summary",
        sourceContent: "Late task content",
        canonicalUrl: "https://example.com/late-generation/late",
        truncated: false,
        requestId: "late-request",
        attempt: { attemptGeneration: 1, taskId: "task-1" },
        now: "2026-07-23T12:05:00.000Z",
      },
      {
        database,
        createId: () => {
          throw new Error("A stale completion must not create a notification");
        },
      },
    );

    expect(result.didFinalize).toBe(false);
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toEqual(seeded.fragment);
    await expect(database.externalLinkImports.get(seeded.externalLinkImport.id)).resolves.toEqual(
      seeded.externalLinkImport,
    );
    await expect(database.chatMessages.count()).resolves.toBe(0);
  });

  it("does not revive an import that is already failed", async () => {
    const seeded = await seedLinkImport(database, {
      key: "already-failed",
      status: "failed",
      taskId: "deleted-task",
      attemptGeneration: 1,
    });

    const result = await completeExternalLinkImport(
      {
        fragmentId: seeded.fragment.id,
        externalNoteId: "late-note",
        title: "Late title",
        summary: "Late summary",
        sourceContent: "Late content",
        canonicalUrl: "https://example.com/already-failed/late",
        truncated: false,
        requestId: "late-request",
        attempt: { attemptGeneration: 1, taskId: "deleted-task" },
        now: "2026-07-23T12:05:00.000Z",
      },
      { database },
    );

    expect(result.didFinalize).toBe(false);
    await expect(database.fragments.get(seeded.fragment.id)).resolves.toEqual(seeded.fragment);
    await expect(database.externalLinkImports.get(seeded.externalLinkImport.id)).resolves.toEqual(
      seeded.externalLinkImport,
    );
  });

  it("marks failure without losing the Fragment, Plant, source URL or created event", async () => {
    const seeded = await seedLinkImport(database, {
      key: "failure",
      status: "processing",
      taskId: "task-failure",
      attemptCount: 2,
    });

    await failExternalLinkImport(
      {
        fragmentId: seeded.fragment.id,
        errorCode: "provider_processing_failed",
        errorMessage: "链接已保留，读取失败。",
        requestId: "failed-request",
        now: "2026-07-23T12:06:00.000Z",
      },
      { database },
    );

    await expect(database.fragments.get(seeded.fragment.id)).resolves.toMatchObject({
      id: seeded.fragment.id,
      title: seeded.fragment.title,
      sourceUrl: seeded.fragment.sourceUrl,
      analysisStatus: "failed",
      lifecycleStatus: "active",
    });
    await expect(database.plants.get(seeded.plant.id)).resolves.toEqual(seeded.plant);
    await expect(
      database.fragmentEvents.where("fragmentId").equals(seeded.fragment.id).count(),
    ).resolves.toBe(1);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "provider_processing_failed",
      errorMessage: "链接已保留，读取失败。",
      providerRequestId: "failed-request",
    });
  });

  it("persists a companion completion notification exactly once across refresh", async () => {
    const seeded = await seedLinkImport(database, {
      key: "companion-complete",
      initiatedBy: "companion",
    });
    const completeInput = {
      fragmentId: seeded.fragment.id,
      externalNoteId: "external-note",
      title: "完成标题",
      summary: "完成摘要",
      sourceContent: "完成正文",
      canonicalUrl: "https://example.com/companion-complete",
      truncated: false,
      requestId: "request-complete",
      attempt: {
        attemptGeneration: seeded.externalLinkImport.attemptGeneration,
        taskId: seeded.externalLinkImport.taskId,
      },
      now: "2026-07-23T12:07:00.000Z",
    } as const;

    const first = await completeExternalLinkImport(completeInput, {
      database,
      createId: () => "completion-message",
    });
    expect(first.notification?.content).toBe(LINK_IMPORT_COMPLETED_COMPANION_MESSAGE);

    const databaseName = database.name;
    database.close();
    database = new FragmentGardenDatabase(databaseName);
    await database.open();

    const afterRefresh = await completeExternalLinkImport(completeInput, {
      database,
      createId: () => {
        throw new Error("A duplicate notification must not request an ID");
      },
    });

    expect(afterRefresh.notification).toBeNull();
    await expect(database.chatMessages.toArray()).resolves.toEqual([
      expect.objectContaining({
        id: "completion-message",
        content: LINK_IMPORT_COMPLETED_COMPANION_MESSAGE,
        fragmentId: seeded.fragment.id,
      }),
    ]);
    await expect(
      database.externalLinkImports.get(seeded.externalLinkImport.id),
    ).resolves.toMatchObject({
      terminalNotificationStatus: "completed",
    });
  });

  it("persists a companion failure notification exactly once", async () => {
    const seeded = await seedLinkImport(database, {
      key: "companion-failure",
      status: "processing",
      initiatedBy: "companion",
    });
    const failureInput = {
      fragmentId: seeded.fragment.id,
      errorCode: "network_error",
      errorMessage: "网络暂不可用。",
      requestId: null,
      now: "2026-07-23T12:08:00.000Z",
    } as const;

    const first = await failExternalLinkImport(failureInput, {
      database,
      createId: () => "failure-message",
    });
    const second = await failExternalLinkImport(failureInput, {
      database,
      createId: () => {
        throw new Error("A duplicate notification must not request an ID");
      },
    });

    expect(first.notification?.content).toBe(LINK_IMPORT_FAILED_COMPANION_MESSAGE);
    expect(second.notification).toBeNull();
    await expect(database.chatMessages.count()).resolves.toBe(1);
    await expect(database.chatMessages.get("failure-message")).resolves.toMatchObject({
      content: LINK_IMPORT_FAILED_COMPANION_MESSAGE,
      fragmentId: seeded.fragment.id,
    });
  });
});
