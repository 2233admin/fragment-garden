import Dexie from "dexie";

import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";
import {
  FRAGMENT_GARDEN_DATABASE_NAME,
  FRAGMENT_GARDEN_DATABASE_VERSION,
  FRAGMENT_GARDEN_SCHEMA,
  FRAGMENT_GARDEN_TABLE_NAMES,
  type FragmentGardenTableName,
} from "../data/schema";
import { createUuid, toIsoTimestamp } from "../domain";
import { fragmentGardenBackupContainerSchema } from "../validation/garden-backup";
import {
  createBackupSummary,
  normalizeRestoredRows,
  readAndValidateBackupRows,
  type GardenBackupRows,
  type GardenBackupSummary,
} from "./garden-backup-integrity";
import {
  publishGardenRestoreEvent,
  runWithGardenRestoreLock,
  type GardenRestoreBroadcastEvent,
} from "./garden-restore-coordination";
import { isQuotaExceededError, LOCAL_STORAGE_FULL_MESSAGE } from "./local-persistence-error";

export const GARDEN_BACKUP_FORMAT_VERSION = 1;
export const MAX_GARDEN_BACKUP_BYTES = 256 * 1024 * 1024;

export type FragmentGardenBackupManifest = Readonly<{
  app: "fragment-garden";
  formatVersion: typeof GARDEN_BACKUP_FORMAT_VERSION;
  databaseVersion: number;
  exportedAt: string;
  counts: Readonly<Record<string, number>>;
  payloadSha256: string;
}>;

export type GardenBackupExport = Readonly<{
  blob: Blob;
  fileName: string;
  manifest: FragmentGardenBackupManifest;
}>;

export type GardenBackupPreflight = Readonly<{
  manifest: FragmentGardenBackupManifest;
  summary: GardenBackupSummary;
}>;

export type GardenBackupErrorCode =
  | "empty_file"
  | "file_too_large"
  | "invalid_backup"
  | "unsupported_backup"
  | "incomplete_backup"
  | "temporary_cleanup_failed"
  | "export_failed"
  | "restore_failed";

export class GardenBackupError extends Error {
  constructor(
    readonly code: GardenBackupErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "GardenBackupError";
  }
}

type GardenBackupDependencies = Readonly<{
  database?: FragmentGardenDatabase;
  createId?: () => string;
  now?: () => Date;
  exportDatabase?: (database: Dexie) => Promise<Blob>;
  importDatabase?: (blob: Blob, databaseName: string) => Promise<Dexie>;
  deleteDatabase?: (databaseName: string) => Promise<void>;
}>;

export type GardenRestoreDependencies = GardenBackupDependencies &
  Readonly<{
    beforeTableWrite?: (tableName: FragmentGardenTableName) => void | Promise<void>;
    publishEvent?: (event: GardenRestoreBroadcastEvent) => void;
    runExclusive?: <T>(operation: () => Promise<T>) => Promise<T>;
  }>;

type InspectedBackup = Readonly<{
  manifest: FragmentGardenBackupManifest;
  rows: GardenBackupRows;
  summary: GardenBackupSummary;
}>;

const FORBIDDEN_BACKUP_FIELD_NAMES = new Set([
  "apikey",
  "authorization",
  "authorizationheader",
  "providerrawresponse",
  "reasoning",
]);

async function loadExportImport() {
  return import("dexie-export-import");
}

async function defaultExportDatabase(database: Dexie): Promise<Blob> {
  const { exportDB } = await loadExportImport();
  return exportDB(database, { prettyJson: false });
}

async function defaultImportDatabase(blob: Blob, databaseName: string): Promise<Dexie> {
  const { importDB } = await loadExportImport();
  return importDB(blob, { name: databaseName });
}

function defaultDeleteDatabase(databaseName: string): Promise<void> {
  return Dexie.delete(databaseName);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new GardenBackupError("invalid_backup", { cause: error });
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasForbiddenField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenField);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      FORBIDDEN_BACKUP_FIELD_NAMES.has(key.replaceAll(/[^a-z]/giu, "").toLowerCase()) ||
      hasForbiddenField(child),
  );
}

function requireExactTableSet(tableNames: readonly string[]): void {
  const uniqueTableNames = new Set(tableNames);
  if (
    uniqueTableNames.size !== FRAGMENT_GARDEN_TABLE_NAMES.length ||
    FRAGMENT_GARDEN_TABLE_NAMES.some((tableName) => !uniqueTableNames.has(tableName))
  ) {
    throw new GardenBackupError("incomplete_backup");
  }
}

function validatePayloadMetadata(
  payload: ReturnType<typeof fragmentGardenBackupContainerSchema.parse>["payload"],
  manifest?: FragmentGardenBackupManifest,
): Record<string, number> {
  if (
    payload.data.databaseName !== FRAGMENT_GARDEN_DATABASE_NAME ||
    payload.data.databaseVersion !== FRAGMENT_GARDEN_DATABASE_VERSION
  ) {
    throw new GardenBackupError("unsupported_backup");
  }

  requireExactTableSet(payload.data.tables.map((table) => table.name));
  requireExactTableSet(payload.data.data.map((table) => table.tableName));
  const counts: Record<string, number> = {};
  for (const table of payload.data.tables) {
    const tableName = table.name as FragmentGardenTableName;
    if (table.schema !== FRAGMENT_GARDEN_SCHEMA[tableName]) {
      throw new GardenBackupError("unsupported_backup");
    }
    const data = payload.data.data.find((candidate) => candidate.tableName === tableName);
    if (data === undefined || data.rows.length !== table.rowCount) {
      throw new GardenBackupError("incomplete_backup");
    }
    counts[tableName] = table.rowCount;
  }

  if (manifest !== undefined) {
    if (
      manifest.databaseVersion !== FRAGMENT_GARDEN_DATABASE_VERSION ||
      Object.keys(manifest.counts).length !== FRAGMENT_GARDEN_TABLE_NAMES.length ||
      FRAGMENT_GARDEN_TABLE_NAMES.some(
        (tableName) => manifest.counts[tableName] !== counts[tableName],
      )
    ) {
      throw new GardenBackupError("incomplete_backup");
    }
  }
  if (hasForbiddenField(payload.data.data)) {
    throw new GardenBackupError("incomplete_backup");
  }
  return counts;
}

function formatBackupFileName(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `fragment-garden-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}

async function importAndInspect(
  payloadBlob: Blob,
  exportedAt: string,
  dependencies: GardenBackupDependencies,
): Promise<Readonly<{ rows: GardenBackupRows; summary: GardenBackupSummary }>> {
  const createId = dependencies.createId ?? createUuid;
  const importDatabase = dependencies.importDatabase ?? defaultImportDatabase;
  const deleteDatabase = dependencies.deleteDatabase ?? defaultDeleteDatabase;
  const temporaryDatabaseName = `${FRAGMENT_GARDEN_DATABASE_NAME}-restore-check-${createId()}`;
  let temporaryDatabase: Dexie | null = null;
  let rows: GardenBackupRows;

  try {
    temporaryDatabase = await importDatabase(payloadBlob, temporaryDatabaseName);
    rows = await readAndValidateBackupRows(temporaryDatabase);
  } catch (error) {
    if (error instanceof GardenBackupError) throw error;
    throw new GardenBackupError("incomplete_backup", { cause: error });
  } finally {
    temporaryDatabase?.close();
    try {
      await deleteDatabase(temporaryDatabaseName);
    } catch (error) {
      throw new GardenBackupError("temporary_cleanup_failed", { cause: error });
    }
  }

  return { rows, summary: createBackupSummary(rows, exportedAt) };
}

async function inspectGardenBackup(
  file: Blob,
  dependencies: GardenBackupDependencies = {},
): Promise<InspectedBackup> {
  if (file.size === 0) throw new GardenBackupError("empty_file");
  if (file.size > MAX_GARDEN_BACKUP_BYTES) throw new GardenBackupError("file_too_large");

  const parsed = fragmentGardenBackupContainerSchema.safeParse(parseJson(await file.text()));
  if (!parsed.success) throw new GardenBackupError("invalid_backup", { cause: parsed.error });
  const manifest = parsed.data.manifest as FragmentGardenBackupManifest;
  validatePayloadMetadata(parsed.data.payload, manifest);
  const payloadJson = JSON.stringify(parsed.data.payload);
  if ((await sha256(payloadJson)) !== manifest.payloadSha256) {
    throw new GardenBackupError("incomplete_backup");
  }
  const inspected = await importAndInspect(
    new Blob([payloadJson], { type: "application/json" }),
    manifest.exportedAt,
    dependencies,
  );
  return { manifest, ...inspected };
}

export async function createGardenBackup(
  dependencies: GardenBackupDependencies = {},
): Promise<GardenBackupExport> {
  const database = dependencies.database ?? fragmentGardenDb;
  const now = dependencies.now ?? (() => new Date());
  const exportDatabase = dependencies.exportDatabase ?? defaultExportDatabase;
  const date = now();
  const exportedAt = toIsoTimestamp(date);

  try {
    requireExactTableSet(database.tables.map((table) => table.name));
    const exportedDatabase = await exportDatabase(database);
    const payload = fragmentGardenBackupContainerSchema.shape.payload.parse(
      parseJson(await exportedDatabase.text()),
    );
    // Test and recovery databases use isolated names, but a portable product
    // backup always declares the canonical garden database identity.
    payload.data.databaseName = FRAGMENT_GARDEN_DATABASE_NAME;
    const counts = validatePayloadMetadata(payload);
    const payloadJson = JSON.stringify(payload);
    const manifest: FragmentGardenBackupManifest = {
      app: "fragment-garden",
      formatVersion: GARDEN_BACKUP_FORMAT_VERSION,
      databaseVersion: FRAGMENT_GARDEN_DATABASE_VERSION,
      exportedAt,
      counts,
      payloadSha256: await sha256(payloadJson),
    };
    const blob = new Blob([JSON.stringify({ manifest, payload })], {
      type: "application/json",
    });
    if (blob.size > MAX_GARDEN_BACKUP_BYTES) throw new GardenBackupError("file_too_large");
    return { blob, fileName: formatBackupFileName(date), manifest };
  } catch (error) {
    if (error instanceof GardenBackupError) throw error;
    throw new GardenBackupError("export_failed", { cause: error });
  }
}

export async function preflightGardenBackup(
  file: Blob,
  dependencies: GardenBackupDependencies = {},
): Promise<GardenBackupPreflight> {
  const inspected = await inspectGardenBackup(file, dependencies);
  return { manifest: inspected.manifest, summary: inspected.summary };
}

async function replaceGardenRows(
  database: FragmentGardenDatabase,
  rows: GardenBackupRows,
  beforeTableWrite?: GardenRestoreDependencies["beforeTableWrite"],
): Promise<void> {
  const tables = FRAGMENT_GARDEN_TABLE_NAMES.map((tableName) => database.table(tableName));
  await database.transaction("rw", tables, async () => {
    for (const tableName of FRAGMENT_GARDEN_TABLE_NAMES) {
      await database.table(tableName).clear();
    }
    for (const tableName of FRAGMENT_GARDEN_TABLE_NAMES) {
      await beforeTableWrite?.(tableName);
      const tableRows = rows[tableName] as object[];
      if (tableRows.length > 0) await database.table<object, string>(tableName).bulkPut(tableRows);
    }
  });
}

export async function restoreGardenBackup(
  file: Blob,
  dependencies: GardenRestoreDependencies = {},
): Promise<GardenBackupPreflight> {
  const inspected = await inspectGardenBackup(file, dependencies);
  const database = dependencies.database ?? fragmentGardenDb;
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? createUuid;
  const publishEvent = dependencies.publishEvent ?? publishGardenRestoreEvent;
  const runExclusive = dependencies.runExclusive ?? runWithGardenRestoreLock;
  const restoredRows = normalizeRestoredRows(inspected.rows, toIsoTimestamp(now()));

  return runExclusive(async () => {
    const operationId = createId();
    publishEvent({ type: "started", operationId });
    try {
      await replaceGardenRows(database, restoredRows, dependencies.beforeTableWrite);
      publishEvent({ type: "completed", operationId });
      return { manifest: inspected.manifest, summary: inspected.summary };
    } catch (error) {
      publishEvent({ type: "failed", operationId });
      throw new GardenBackupError("restore_failed", { cause: error });
    }
  });
}

export function gardenBackupErrorMessage(error: unknown): string {
  if (isQuotaExceededError(error)) return LOCAL_STORAGE_FULL_MESSAGE;
  if (error instanceof GardenBackupError) {
    if (error.code === "file_too_large") return "这份备份文件太大，当前版本无法安全读取。";
    if (error.code === "incomplete_backup") return "备份文件不完整或已损坏。";
    if (error.code === "unsupported_backup") return "这份备份来自当前版本不支持的格式。";
    if (error.code === "restore_failed") {
      return "恢复没有完成，你原来的花园没有被修改。请稍后重试。";
    }
    if (error.code === "export_failed") return "暂时无法准备备份，你的内容没有被修改。";
  }
  return "备份文件无法读取。请选择由碎片花园导出的完整备份。";
}
