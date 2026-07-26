import type Dexie from "dexie";

import type {
  Attachment,
  ChatMessage,
  Cluster,
  ContentProcessingJob,
  ExternalLinkImport,
  Fragment,
  FragmentEvent,
  FragmentNote,
  FragmentRelation,
  MediaAsset,
  Plant,
  Recommendation,
  Settings,
} from "../domain";
import { FRAGMENT_GARDEN_TABLE_NAMES, type FragmentGardenTableName } from "../data/schema";
import { BACKUP_TABLE_ROW_SCHEMAS } from "../validation/garden-backup";
import { validateAudioBlob } from "../validation/media-audio";
import { validateImageBlob } from "../validation/media-image";

export type GardenBackupRows = {
  settings: Settings[];
  fragments: Fragment[];
  attachments: Attachment[];
  fragmentEvents: FragmentEvent[];
  plants: Plant[];
  relations: FragmentRelation[];
  clusters: Cluster[];
  recommendations: Recommendation[];
  chatMessages: ChatMessage[];
  externalLinkImports: ExternalLinkImport[];
  mediaAssets: MediaAsset[];
  fragmentNotes: FragmentNote[];
  contentProcessingJobs: ContentProcessingJob[];
};

export type GardenBackupSummary = Readonly<{
  exportedAt: string;
  noteCount: number;
  plantCount: number;
  imageCount: number;
  appendedNoteCount: number;
  sproutRelationCount: number;
  processingJobCount: number;
  historicalMediaCount: number;
}>;

function backupIntegrityError(reason: string): Error {
  return new Error(`Backup integrity check failed: ${reason}`);
}

function assertUniqueIds(tableName: FragmentGardenTableName, rows: readonly unknown[]): void {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = (row as { id: string }).id;
    if (ids.has(id)) throw backupIntegrityError(`${tableName} contains a duplicate id`);
    ids.add(id);
  }
}

export async function readAndValidateBackupRows(database: Dexie): Promise<GardenBackupRows> {
  const entries = await Promise.all(
    FRAGMENT_GARDEN_TABLE_NAMES.map(async (tableName) => {
      const rows = await database.table(tableName).toArray();
      const parsed = BACKUP_TABLE_ROW_SCHEMAS[tableName].array().safeParse(rows);
      if (!parsed.success) throw backupIntegrityError(`${tableName} contains invalid data`);
      assertUniqueIds(tableName, parsed.data);
      return [tableName, parsed.data] as const;
    }),
  );

  const rows = Object.fromEntries(entries) as GardenBackupRows;
  validateBackupReferences(rows);
  await validateBackupMedia(rows);
  return rows;
}

function assertReferences(
  fragmentIds: ReadonlySet<string>,
  references: readonly (string | null)[],
  label: string,
): void {
  if (references.some((fragmentId) => fragmentId !== null && !fragmentIds.has(fragmentId))) {
    throw backupIntegrityError(`${label} references a missing note`);
  }
}

function validateBlobMetadata(
  blob: Blob,
  expectedSize: number,
  expectedType: string,
  label: string,
): void {
  if (blob.size !== expectedSize || blob.type !== expectedType) {
    throw backupIntegrityError(`${label} contains unreadable media`);
  }
}

async function validateMediaBlob(
  kind: "image" | "audio",
  blob: Blob,
  durationMs: number | null,
  label: string,
): Promise<void> {
  try {
    if (kind === "image") {
      await validateImageBlob(blob);
    } else {
      await validateAudioBlob(blob, durationMs);
    }
  } catch {
    throw backupIntegrityError(`${label} contains unreadable media`);
  }
}

async function validateBackupMedia(rows: GardenBackupRows): Promise<void> {
  for (const asset of rows.mediaAssets) {
    await validateMediaBlob(asset.kind, asset.blob, asset.durationMs, "A media item");
    if (asset.kind === "image" && asset.width !== null && asset.height !== null) {
      const dimensions = await validateImageBlob(asset.blob);
      if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
        throw backupIntegrityError("A media item contains inconsistent dimensions");
      }
    }
  }
  for (const attachment of rows.attachments) {
    await validateMediaBlob(attachment.kind, attachment.blob, null, "A legacy attachment");
  }
  for (const job of rows.contentProcessingJobs) {
    if (job.sourceBlob === null) continue;
    if (job.kind !== "image" || job.sourceMimeType === null) {
      throw backupIntegrityError("A processing task contains unexpected media");
    }
    await validateMediaBlob("image", job.sourceBlob, null, "A processing task");
  }
}

export function validateBackupReferences(rows: GardenBackupRows): void {
  const fragmentIds = new Set(rows.fragments.map((fragment) => fragment.id));
  const relationIds = new Set(rows.relations.map((relation) => relation.id));

  assertReferences(
    fragmentIds,
    rows.fragments.map((fragment) => fragment.parentFragmentId),
    "A note",
  );
  assertReferences(
    fragmentIds,
    rows.plants.map((plant) => plant.fragmentId),
    "A plant",
  );
  assertReferences(
    fragmentIds,
    rows.fragmentNotes.map((note) => note.fragmentId),
    "An appended note",
  );
  assertReferences(
    fragmentIds,
    rows.mediaAssets.map((asset) => asset.fragmentId),
    "A media item",
  );
  assertReferences(
    fragmentIds,
    rows.attachments.map((attachment) => attachment.fragmentId),
    "A legacy attachment",
  );
  assertReferences(
    fragmentIds,
    rows.fragmentEvents.map((event) => event.fragmentId),
    "An event",
  );
  assertReferences(
    fragmentIds,
    rows.relations.flatMap((relation) => [relation.sourceFragmentId, relation.targetFragmentId]),
    "A source relation",
  );
  assertReferences(
    fragmentIds,
    rows.recommendations.map((recommendation) => recommendation.fragmentId),
    "A recommendation",
  );
  assertReferences(
    fragmentIds,
    rows.externalLinkImports.map((linkImport) => linkImport.fragmentId),
    "A legacy link import",
  );
  assertReferences(
    fragmentIds,
    rows.chatMessages.map((message) => message.fragmentId),
    "A legacy message",
  );
  assertReferences(
    fragmentIds,
    rows.contentProcessingJobs.flatMap((job) => [job.sourceFragmentId, job.createdFragmentId]),
    "A processing task",
  );

  for (const cluster of rows.clusters) {
    assertReferences(fragmentIds, cluster.memberFragmentIds, "A legacy cluster");
  }

  const occupiedSlots = new Set<string>();
  const plantFragmentIds = new Set<string>();
  for (const plant of rows.plants) {
    if (plantFragmentIds.has(plant.fragmentId)) {
      throw backupIntegrityError("A note has more than one plant");
    }
    plantFragmentIds.add(plant.fragmentId);
    if (plant.slotId !== null) {
      if (occupiedSlots.has(plant.slotId)) {
        throw backupIntegrityError("A garden slot is occupied more than once");
      }
      occupiedSlots.add(plant.slotId);
    }
    const fragment = rows.fragments.find((candidate) => candidate.id === plant.fragmentId);
    if (
      fragment !== undefined &&
      (fragment.lifecycleStatus === "archived" || fragment.lifecycleStatus === "deleted") &&
      plant.slotId !== null
    ) {
      throw backupIntegrityError("A removed note still occupies a garden slot");
    }
  }

  const mediaFragmentIds = new Set<string>();
  for (const asset of rows.mediaAssets) {
    if (mediaFragmentIds.has(asset.fragmentId)) {
      throw backupIntegrityError("A note has more than one primary media item");
    }
    mediaFragmentIds.add(asset.fragmentId);
    validateBlobMetadata(asset.blob, asset.sizeBytes, asset.mimeType, "A media item");
  }
  for (const attachment of rows.attachments) {
    validateBlobMetadata(
      attachment.blob,
      attachment.sizeBytes,
      attachment.mimeType,
      "A legacy attachment",
    );
  }
  for (const job of rows.contentProcessingJobs) {
    if (
      job.sourceBlob !== null &&
      job.sourceMimeType !== null &&
      job.sourceBlob.type !== job.sourceMimeType
    ) {
      throw backupIntegrityError("A processing task contains unreadable media");
    }
    if (job.status === "completed" && job.createdFragmentId === null) {
      throw backupIntegrityError("A completed task has no created note");
    }
    if (job.kind === "image" && job.status === "completed" && job.createdFragmentId !== null) {
      const asset = rows.mediaAssets.find(
        (candidate) => candidate.fragmentId === job.createdFragmentId,
      );
      if (asset?.kind !== "image")
        throw backupIntegrityError("A completed image task has no image");
    }
    if (job.kind === "sprout" && job.status === "completed" && job.createdFragmentId !== null) {
      const hasRelation = rows.relations.some(
        (relation) =>
          relation.relationType === "grows_from" &&
          relation.status === "confirmed" &&
          relation.sourceFragmentId === job.createdFragmentId &&
          relation.targetFragmentId === job.sourceFragmentId,
      );
      if (!hasRelation)
        throw backupIntegrityError("A completed sprout task has no source relation");
    }
  }

  if (relationIds.size !== rows.relations.length) {
    throw backupIntegrityError("Source relations contain duplicate ids");
  }
}

export function normalizeRestoredRows(
  rows: GardenBackupRows,
  restoredAt: string,
): GardenBackupRows {
  return {
    ...rows,
    externalLinkImports: rows.externalLinkImports.map((linkImport) =>
      linkImport.status === "pending" || linkImport.status === "processing"
        ? {
            ...linkImport,
            status: "failed",
            taskId: null,
            providerRequestId: null,
            errorCode: "restored_interrupted",
            errorMessage: "恢复后需要手动继续。",
            updatedAt: restoredAt,
          }
        : linkImport,
    ),
    mediaAssets: rows.mediaAssets.map((asset) =>
      asset.processingStatus === "pending" || asset.processingStatus === "processing"
        ? {
            ...asset,
            processingStatus: "failed",
            processingRequestId: null,
            errorCode: "restored_interrupted",
            updatedAt: restoredAt,
          }
        : asset,
    ),
    contentProcessingJobs: rows.contentProcessingJobs.map((job) => {
      const canKeepPreview =
        job.kind === "sprout" &&
        job.status === "awaiting_confirmation" &&
        job.sourceFragmentId !== null &&
        job.resultTitle?.trim() !== "" &&
        job.resultMarkdown?.trim() !== "";
      if (
        canKeepPreview ||
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      ) {
        return job;
      }
      return {
        ...job,
        status: "failed",
        providerTaskId: null,
        processingRequestId: null,
        errorCode: "restored_interrupted",
        errorMessage: "恢复后需要手动继续。",
        updatedAt: restoredAt,
        lastPolledAt: null,
      };
    }),
  };
}

export function createBackupSummary(
  rows: GardenBackupRows,
  exportedAt: string,
): GardenBackupSummary {
  const activeStatuses = new Set(["pending", "processing", "awaiting_confirmation"]);
  return {
    exportedAt,
    noteCount: rows.fragments.length,
    plantCount: rows.plants.length,
    imageCount: rows.mediaAssets.filter((asset) => asset.kind === "image").length,
    appendedNoteCount: rows.fragmentNotes.length,
    sproutRelationCount: rows.relations.filter(
      (relation) => relation.relationType === "grows_from" && relation.status === "confirmed",
    ).length,
    processingJobCount: rows.contentProcessingJobs.filter((job) => activeStatuses.has(job.status))
      .length,
    historicalMediaCount: rows.mediaAssets.filter((asset) => asset.kind === "audio").length,
  };
}
