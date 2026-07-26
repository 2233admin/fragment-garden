import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Fragment, Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import {
  FRAGMENT_GARDEN_DATABASE_VERSION,
  FRAGMENT_GARDEN_TABLE_NAMES,
} from "../../../data/schema";
import {
  createGardenBackup,
  GardenBackupError,
  MAX_GARDEN_BACKUP_BYTES,
  preflightGardenBackup,
  restoreGardenBackup,
} from "../../../services/garden-backup";
import { fragmentGardenBackupContainerSchema } from "../../../validation/garden-backup";
import { BACKUP_TEST_TIME, seedCompleteGarden } from "./garden-backup-fixtures";

class TestFileReader {
  result: ArrayBuffer | null = null;
  error: DOMException | null = null;
  onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
      },
      (error: unknown) => {
        this.error = error instanceof DOMException ? error : new DOMException("Blob read failed");
        this.onerror?.({ target: this } as unknown as ProgressEvent<FileReader>);
      },
    );
  }
}

const originalSelf = Object.getOwnPropertyDescriptor(globalThis, "self");
const originalFileReader = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
let database: FragmentGardenDatabase;

beforeAll(() => {
  Object.defineProperty(globalThis, "self", { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: TestFileReader as unknown as typeof FileReader,
  });
});

afterAll(() => {
  if (originalSelf === undefined) delete (globalThis as { self?: unknown }).self;
  else Object.defineProperty(globalThis, "self", originalSelf);
  if (originalFileReader === undefined) delete (globalThis as { FileReader?: unknown }).FileReader;
  else Object.defineProperty(globalThis, "FileReader", originalFileReader);
});

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-backup-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

async function parseBackup(backup: Blob) {
  return fragmentGardenBackupContainerSchema.parse(JSON.parse(await backup.text()) as unknown);
}

async function resignBackup(container: Awaited<ReturnType<typeof parseBackup>>): Promise<Blob> {
  const payloadJson = JSON.stringify(container.payload);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadJson));
  container.manifest.payloadSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return new Blob([JSON.stringify(container)], { type: "application/json" });
}

function tableRows(
  container: Awaited<ReturnType<typeof parseBackup>>,
  tableName: string,
): Record<string, unknown>[] {
  const table = container.payload.data.data.find((candidate) => candidate.tableName === tableName);
  if (table === undefined) throw new Error(`Missing ${tableName} backup data`);
  return table.rows as Record<string, unknown>[];
}

function currentFragment(): Fragment {
  return {
    id: "current-only",
    contentType: "text",
    title: "当前花园内容",
    rawText: "不能丢失",
    sourceUrl: null,
    contentMarkdown: "不能丢失",
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
    lastInteractedAt: BACKUP_TEST_TIME,
    completedAt: null,
  };
}

function currentPlant(): Plant {
  return {
    id: "current-plant",
    fragmentId: "current-only",
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId: "slot-20",
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
  };
}

describe("garden backup export and restore", () => {
  it("exports an empty consistent V5 snapshot with every current table in the manifest", async () => {
    const result = await createGardenBackup({
      database,
      now: () => new Date(BACKUP_TEST_TIME),
    });
    const container = await parseBackup(result.blob);

    expect(result.fileName).toBe("fragment-garden-backup-2026-07-26-1815.json");
    expect(container.manifest).toMatchObject({
      app: "fragment-garden",
      formatVersion: 1,
      databaseVersion: FRAGMENT_GARDEN_DATABASE_VERSION,
      exportedAt: BACKUP_TEST_TIME,
    });
    expect(Object.keys(container.manifest.counts).sort()).toEqual(
      [...FRAGMENT_GARDEN_TABLE_NAMES].sort(),
    );
    expect(Object.values(container.manifest.counts)).toEqual(
      expect.arrayContaining(FRAGMENT_GARDEN_TABLE_NAMES.map(() => 0)),
    );
    await expect(preflightGardenBackup(result.blob)).resolves.toMatchObject({
      summary: { noteCount: 0, imageCount: 0, historicalMediaCount: 0 },
    });
    expect(await result.blob.text()).not.toMatch(/api[_-]?key|authorization/iu);
  });

  it("round-trips all formal and legacy records, Blobs, relations, and interrupted tasks", async () => {
    await seedCompleteGarden(database);
    const backup = await createGardenBackup({ database });
    const preflight = await preflightGardenBackup(backup.blob);
    expect(preflight.summary).toMatchObject({
      noteCount: 6,
      plantCount: 6,
      imageCount: 1,
      appendedNoteCount: 1,
      sproutRelationCount: 1,
      processingJobCount: 2,
      historicalMediaCount: 1,
    });

    await database.transaction("rw", database.tables, async () => {
      for (const table of database.tables) await table.clear();
      await database.fragments.add(currentFragment());
      await database.plants.add(currentPlant());
    });

    await restoreGardenBackup(backup.blob, { database });
    await expect(database.fragments.get("current-only")).resolves.toBeUndefined();
    await expect(database.fragments.count()).resolves.toBe(6);
    await expect(database.fragmentNotes.get("source-note")).resolves.toMatchObject({
      contentMarkdown: "第一条追加笔记。",
    });
    await expect(database.relations.get("sprout-relation")).resolves.toMatchObject({
      relationType: "grows_from",
      status: "confirmed",
    });
    expect(await (await database.mediaAssets.get("image-asset"))?.blob.text()).toBe("image-binary");
    expect(await (await database.mediaAssets.get("audio-asset"))?.blob.text()).toBe("audio-binary");
    await expect(database.chatMessages.get("legacy-chat")).resolves.toBeDefined();
    await expect(database.fragmentEvents.get("legacy-partner-event")).resolves.toBeDefined();
    await expect(database.externalLinkImports.get("legacy-link-import")).resolves.toMatchObject({
      status: "failed",
      taskId: null,
      errorCode: "restored_interrupted",
    });
    await expect(database.contentProcessingJobs.get("pending-image-job")).resolves.toMatchObject({
      status: "failed",
      providerTaskId: null,
      processingRequestId: null,
      errorCode: "restored_interrupted",
    });
    expect((await database.contentProcessingJobs.get("pending-image-job"))?.sourceBlob?.size).toBe(
      new Blob(["pending-image"]).size,
    );
    await expect(database.contentProcessingJobs.get("sprout-preview-job")).resolves.toMatchObject({
      status: "awaiting_confirmation",
      resultTitle: "发芽预览",
    });
  });

  it("rejects foreign, unsupported, incomplete, oversized, and extra-field files", async () => {
    await expect(preflightGardenBackup(new Blob(["not-json"]))).rejects.toMatchObject({
      code: "invalid_backup",
    });
    await expect(
      preflightGardenBackup({ size: MAX_GARDEN_BACKUP_BYTES + 1 } as Blob),
    ).rejects.toMatchObject({ code: "file_too_large" });

    const exported = await createGardenBackup({ database });
    const unsupported = await parseBackup(exported.blob);
    unsupported.manifest.databaseVersion = 99;
    unsupported.payload.data.databaseVersion = 99;
    await expect(preflightGardenBackup(await resignBackup(unsupported))).rejects.toMatchObject({
      code: "unsupported_backup",
    });

    const incomplete = await parseBackup(exported.blob);
    incomplete.payload.data.tables.pop();
    incomplete.payload.data.data.pop();
    await expect(preflightGardenBackup(await resignBackup(incomplete))).rejects.toMatchObject({
      code: "incomplete_backup",
    });

    const withExtraField = JSON.parse(await exported.blob.text()) as Record<string, unknown>;
    withExtraField.executable = "<script>alert(1)</script>";
    await expect(
      preflightGardenBackup(new Blob([JSON.stringify(withExtraField)])),
    ).rejects.toMatchObject({ code: "invalid_backup" });
  });

  it("rejects broken references, duplicate slots, and damaged Blob payloads", async () => {
    await seedCompleteGarden(database);
    const exported = await createGardenBackup({ database });

    const brokenReference = await parseBackup(exported.blob);
    tableRows(brokenReference, "fragmentNotes")[0]!.fragmentId = "missing-fragment";
    await expect(preflightGardenBackup(await resignBackup(brokenReference))).rejects.toMatchObject({
      code: "incomplete_backup",
    });

    const duplicateSlot = await parseBackup(exported.blob);
    const plants = tableRows(duplicateSlot, "plants");
    const slottedPlants = plants.filter((plant) => typeof plant.slotId === "string");
    slottedPlants[1]!.slotId = slottedPlants[0]!.slotId;
    await expect(preflightGardenBackup(await resignBackup(duplicateSlot))).rejects.toMatchObject({
      code: "incomplete_backup",
    });

    const damagedMedia = await parseBackup(exported.blob);
    const mediaRow = tableRows(damagedMedia, "mediaAssets")[0]!;
    const encodedBlob = mediaRow.blob as Record<string, unknown>;
    encodedBlob.data = "AA==";
    await expect(preflightGardenBackup(await resignBackup(damagedMedia))).rejects.toMatchObject({
      code: "incomplete_backup",
    });
  });

  it("rolls back the complete replacement when any table write fails", async () => {
    await seedCompleteGarden(database);
    const backup = await createGardenBackup({ database });
    await database.transaction("rw", database.tables, async () => {
      for (const table of database.tables) await table.clear();
      await database.fragments.add(currentFragment());
      await database.plants.add(currentPlant());
    });

    await expect(
      restoreGardenBackup(backup.blob, {
        database,
        beforeTableWrite: (tableName) => {
          if (tableName === "plants") throw new Error("simulated write failure");
        },
      }),
    ).rejects.toBeInstanceOf(GardenBackupError);
    await expect(database.fragments.toArray()).resolves.toEqual([currentFragment()]);
    await expect(database.plants.toArray()).resolves.toEqual([currentPlant()]);
    await expect(database.mediaAssets.count()).resolves.toBe(0);
  });

  it("removes its validation database and returns no successful export on failure", async () => {
    const exported = await createGardenBackup({ database });
    await preflightGardenBackup(exported.blob, { createId: () => "known-temp" });
    await expect(Dexie.exists("fragment-garden-restore-check-known-temp")).resolves.toBe(false);

    await expect(
      createGardenBackup({
        database,
        exportDatabase: async () => Promise.reject(new Error("simulated export failure")),
      }),
    ).rejects.toMatchObject({ code: "export_failed" });
  });
});
