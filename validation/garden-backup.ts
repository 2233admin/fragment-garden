import { z } from "zod";

import type { FragmentGardenTableName } from "../data/schema";

const idSchema = z.string().min(1);
const nullableIdSchema = idSchema.nullable();
const timestampSchema = z.string().min(1);
const nullableTimestampSchema = timestampSchema.nullable();
const blobSchema = z.custom<Blob>(
  (value) => typeof Blob !== "undefined" && value instanceof Blob,
  "Expected a readable Blob",
);

export const backupManifestSchema = z
  .object({
    app: z.literal("fragment-garden"),
    formatVersion: z.literal(1),
    databaseVersion: z.number().int().positive(),
    exportedAt: timestampSchema,
    counts: z.record(z.string(), z.number().int().nonnegative()),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export const dexieExportPayloadSchema = z
  .object({
    formatName: z.literal("dexie"),
    formatVersion: z.literal(1),
    data: z
      .object({
        databaseName: z.string().min(1),
        databaseVersion: z.number().int().positive(),
        tables: z.array(
          z
            .object({
              name: z.string().min(1),
              schema: z.string(),
              rowCount: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        data: z.array(
          z
            .object({
              tableName: z.string().min(1),
              inbound: z.boolean(),
              rows: z.array(z.unknown()),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const fragmentGardenBackupContainerSchema = z
  .object({
    manifest: backupManifestSchema,
    payload: dexieExportPayloadSchema,
  })
  .strict();

const settingsSchema = z
  .object({
    id: z.literal("local-user"),
    onboardingCompleted: z.boolean(),
    companionType: z.enum(["cat", "dog"]).nullable(),
    lastOpenedAt: nullableTimestampSchema,
    lastRecommendationDate: z.string().nullable(),
    getNoteDisclosureAcceptedAt: nullableTimestampSchema.optional(),
    openAiDisclosureAcceptedAt: nullableTimestampSchema.optional(),
    sproutAiDisclosureAcceptedAt: nullableTimestampSchema.optional(),
    imageAiDisclosureAcceptedAt: nullableTimestampSchema.optional(),
    voiceAiDisclosureAcceptedAt: nullableTimestampSchema.optional(),
    schemaVersion: z.number().int().positive(),
  })
  .passthrough();

const fragmentSchema = z
  .object({
    id: idSchema,
    contentType: z.enum(["text", "link", "image", "audio"]),
    title: z.string(),
    rawText: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    contentMarkdown: z.string(),
    summary: z.string().nullable(),
    keywords: z.array(z.string()),
    lifecycleStatus: z.enum(["active", "dormant", "archived", "deleted"]),
    completionStatus: z.enum(["open", "completed"]),
    analysisStatus: z.enum(["not_required", "pending", "completed", "failed"]),
    embedding: z.array(z.number()).nullable(),
    parentFragmentId: nullableIdSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    lastInteractedAt: timestampSchema,
    completedAt: nullableTimestampSchema,
  })
  .passthrough();

const attachmentSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    kind: z.enum(["image", "audio"]),
    blob: blobSchema,
    mimeType: z.string(),
    fileName: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    transcript: z.string().nullable(),
    extractedText: z.string().nullable(),
    createdAt: timestampSchema,
  })
  .passthrough();

const eventSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    type: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).nullable(),
    occurredAt: timestampSchema,
    ruleVersion: z.number().int().positive(),
  })
  .passthrough();

const plantSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    speciesId: z
      .enum(["dandelion", "forget_me_not", "tulip", "sunflower", "lavender", "small_tree"])
      .nullable(),
    stage: z.enum(["seedling", "growing", "budding", "blooming", "permanent_bloom"]),
    vitality: z.enum(["active", "dormant"]),
    growthScore: z.number().int().nonnegative(),
    slotId: z.string().nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .passthrough();

const relationSchema = z
  .object({
    id: idSchema,
    sourceFragmentId: idSchema,
    targetFragmentId: idSchema,
    relationType: z.enum(["similar", "related", "grows_from"]),
    status: z.enum(["suggested", "confirmed", "ignored"]),
    similarityScore: z.number().nullable(),
    explanation: z.string().nullable(),
    createdAt: timestampSchema,
    confirmedAt: nullableTimestampSchema,
  })
  .passthrough();

const clusterSchema = z
  .object({
    id: idSchema,
    title: z.string(),
    memberFragmentIds: z.array(idSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .passthrough();

const recommendationSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    reason: z.enum(["dormant", "not_reviewed", "related_to_recent"]),
    shownAt: timestampSchema,
    openedAt: nullableTimestampSchema,
    dismissedAt: nullableTimestampSchema,
  })
  .passthrough();

const chatMessageSchema = z
  .object({
    id: idSchema,
    fragmentId: nullableIdSchema,
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    createdAt: timestampSchema,
    source: z.enum(["local", "openai", "tool", "system"]).optional(),
    status: z.enum(["pending", "completed", "failed"]).optional(),
  })
  .passthrough();

const externalLinkImportSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    provider: z.literal("getnote"),
    sourceUrl: z.string(),
    normalizedUrl: z.string(),
    canonicalUrl: z.string().nullable(),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    initiatedBy: z.enum(["form", "companion"]),
    taskId: z.string().nullable(),
    externalNoteId: z.string().nullable(),
    attemptCount: z.number().int().nonnegative(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .passthrough();

const mediaAssetSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    kind: z.enum(["image", "audio"]),
    blob: blobSchema,
    mimeType: z.string(),
    fileName: z.string().nullable(),
    sizeBytes: z.number().int().nonnegative(),
    width: z.number().int().nonnegative().nullable(),
    height: z.number().int().nonnegative().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    processingStatus: z.enum(["local_only", "pending", "processing", "completed", "failed"]),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .passthrough();

const fragmentNoteSchema = z
  .object({
    id: idSchema,
    fragmentId: idSchema,
    contentMarkdown: z.string(),
    source: z.literal("user"),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .passthrough();

const processingJobSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["link", "image", "sprout"]),
    status: z.enum([
      "pending",
      "processing",
      "awaiting_confirmation",
      "completed",
      "failed",
      "cancelled",
    ]),
    sourceBlob: blobSchema.nullable(),
    sourceFragmentId: nullableIdSchema,
    createdFragmentId: nullableIdSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .passthrough();

export const BACKUP_TABLE_ROW_SCHEMAS: Readonly<Record<FragmentGardenTableName, z.ZodType>> = {
  settings: settingsSchema,
  fragments: fragmentSchema,
  attachments: attachmentSchema,
  fragmentEvents: eventSchema,
  plants: plantSchema,
  relations: relationSchema,
  clusters: clusterSchema,
  recommendations: recommendationSchema,
  chatMessages: chatMessageSchema,
  externalLinkImports: externalLinkImportSchema,
  mediaAssets: mediaAssetSchema,
  fragmentNotes: fragmentNoteSchema,
  contentProcessingJobs: processingJobSchema,
};
