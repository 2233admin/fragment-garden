import type {
  ContentProcessingJob,
  ExternalLinkImport,
  Fragment,
  FragmentEvent,
  MediaAsset,
  Plant,
} from "../../../domain";
import { createDefaultSettings } from "../../../domain/companion/settings";
import type { FragmentGardenDatabase } from "../../../data/db";

export const BACKUP_TEST_TIME = "2026-07-26T10:15:00.000Z";

function fragment(
  id: string,
  contentType: Fragment["contentType"],
  lifecycleStatus: Fragment["lifecycleStatus"] = "active",
  completionStatus: Fragment["completionStatus"] = "open",
): Fragment {
  return {
    id,
    contentType,
    title: `笔记 ${id}`,
    rawText: contentType === "text" ? `原始内容 ${id}` : null,
    sourceUrl: contentType === "link" ? "https://example.com/article" : null,
    contentMarkdown: `# 笔记 ${id}\n\n安全正文。`,
    summary: null,
    keywords: [],
    lifecycleStatus,
    completionStatus,
    analysisStatus: contentType === "text" ? "not_required" : "completed",
    embedding: null,
    parentFragmentId: id === "child" ? "source" : null,
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
    lastInteractedAt: BACKUP_TEST_TIME,
    completedAt: completionStatus === "completed" ? BACKUP_TEST_TIME : null,
  };
}

function plant(
  id: string,
  fragmentId: string,
  slotId: string | null,
  vitality: Plant["vitality"] = "active",
): Plant {
  return {
    id,
    fragmentId,
    speciesId: null,
    stage: "seedling",
    vitality,
    growthScore: 0,
    slotId,
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
  };
}

function event(
  id: string,
  fragmentId: string,
  type: FragmentEvent["type"] = "created",
): FragmentEvent {
  return {
    id,
    fragmentId,
    type,
    payload:
      type === "partner_suggestion_saved"
        ? {
            direction: "保留的历史建议",
            guidingQuestion: "下一步是什么？",
            recommendedAction: "add_content",
            source: "partner",
            promptVersion: "legacy-v1",
            localDateKey: "2026-07-26",
          }
        : null,
    occurredAt: BACKUP_TEST_TIME,
    ruleVersion: 1,
  };
}

function mediaAsset(fragmentId: string, kind: MediaAsset["kind"]): MediaAsset {
  const blob = new Blob([kind === "image" ? "image-binary" : "audio-binary"], {
    type: kind === "image" ? "image/png" : "audio/webm",
  });
  return {
    id: `${kind}-asset`,
    fragmentId,
    kind,
    blob,
    mimeType: blob.type,
    fileName: kind === "image" ? "garden.png" : "history.webm",
    sizeBytes: blob.size,
    width: kind === "image" ? 640 : null,
    height: kind === "image" ? 480 : null,
    durationMs: kind === "audio" ? 12_000 : null,
    processingStatus: "completed",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: null,
    generatedTitle: kind === "image" ? "图片笔记" : null,
    summary: kind === "image" ? "一张测试图片。" : null,
    visibleText: kind === "image" ? "测试文字" : null,
    contentKind: kind === "image" ? "screenshot" : null,
    transcript: kind === "audio" ? "编辑后的历史转写" : null,
    originalTranscript: kind === "audio" ? "原始历史转写" : null,
    transcriptEditedAt: kind === "audio" ? BACKUP_TEST_TIME : null,
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
  };
}

function processingJob(
  id: string,
  kind: ContentProcessingJob["kind"],
  status: ContentProcessingJob["status"],
): ContentProcessingJob {
  const sourceBlob = kind === "image" ? new Blob(["pending-image"], { type: "image/png" }) : null;
  return {
    id,
    kind,
    status,
    sourceUrl: kind === "link" ? "https://example.com/pending" : null,
    normalizedSourceUrl: kind === "link" ? "https://example.com/pending" : null,
    allowDuplicate: false,
    initiator: kind === "link" ? "form" : null,
    userTitle: null,
    userNoteMarkdown: null,
    sourceBlob,
    sourceMimeType: sourceBlob?.type ?? null,
    sourceFileName: sourceBlob === null ? null : "pending.png",
    sourceWidth: sourceBlob === null ? null : 320,
    sourceHeight: sourceBlob === null ? null : 200,
    sourceFragmentId: kind === "sprout" ? "source" : null,
    sourceSnapshot: kind === "sprout" ? JSON.stringify({ source: "snapshot" }) : null,
    createdFragmentId: null,
    providerTaskId: status === "processing" ? "remote-task" : null,
    processingRequestId: status === "processing" ? "request-id" : null,
    resultTitle: status === "awaiting_confirmation" ? "发芽预览" : null,
    resultMarkdown: status === "awaiting_confirmation" ? "# 发芽预览\n\n完整正文。" : null,
    errorCode: null,
    errorMessage: null,
    attemptCount: status === "pending" ? 0 : 1,
    attemptGeneration: status === "pending" ? 0 : 1,
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
    startedAt: status === "pending" ? null : BACKUP_TEST_TIME,
    lastPolledAt: status === "processing" ? BACKUP_TEST_TIME : null,
  };
}

export async function seedCompleteGarden(database: FragmentGardenDatabase): Promise<void> {
  const fragments = [
    fragment("source", "text"),
    fragment("child", "text", "active", "completed"),
    fragment("link", "link"),
    fragment("image", "image", "dormant"),
    fragment("audio", "audio", "archived"),
    fragment("deleted", "text", "deleted"),
  ];
  const plants = [
    plant("source-plant", "source", "slot-01"),
    plant("child-plant", "child", "slot-02"),
    plant("link-plant", "link", "slot-03"),
    plant("image-plant", "image", "slot-04", "dormant"),
    plant("audio-plant", "audio", null),
    plant("deleted-plant", "deleted", null),
  ];
  const legacyLinkImport: ExternalLinkImport = {
    id: "legacy-link-import",
    fragmentId: "link",
    provider: "getnote",
    sourceUrl: "https://example.com/article",
    normalizedUrl: "https://example.com/article",
    canonicalUrl: null,
    sourceContent: "历史网页正文",
    sourceContentTruncated: false,
    status: "processing",
    initiatedBy: "form",
    taskId: "legacy-task",
    externalNoteId: null,
    providerRequestId: "legacy-request",
    attemptCount: 1,
    attemptGeneration: 1,
    userProvidedTitle: false,
    userProvidedContent: false,
    errorCode: null,
    errorMessage: null,
    terminalNotificationStatus: null,
    createdAt: BACKUP_TEST_TIME,
    updatedAt: BACKUP_TEST_TIME,
    startedAt: BACKUP_TEST_TIME,
    lastPolledAt: BACKUP_TEST_TIME,
    completedAt: null,
  };

  await database.transaction("rw", database.tables, async () => {
    await database.settings.add({ ...createDefaultSettings(), onboardingCompleted: true });
    await database.fragments.bulkAdd(fragments);
    await database.plants.bulkAdd(plants);
    await database.fragmentEvents.bulkAdd([
      ...fragments.map((item) => event(`${item.id}-created`, item.id)),
      event("legacy-partner-event", "source", "partner_suggestion_saved"),
    ]);
    await database.fragmentNotes.add({
      id: "source-note",
      fragmentId: "source",
      contentMarkdown: "第一条追加笔记。",
      source: "user",
      createdAt: BACKUP_TEST_TIME,
      updatedAt: BACKUP_TEST_TIME,
    });
    await database.relations.add({
      id: "sprout-relation",
      sourceFragmentId: "child",
      targetFragmentId: "source",
      relationType: "grows_from",
      status: "confirmed",
      similarityScore: null,
      explanation: null,
      createdAt: BACKUP_TEST_TIME,
      confirmedAt: BACKUP_TEST_TIME,
    });
    await database.mediaAssets.bulkAdd([
      mediaAsset("image", "image"),
      mediaAsset("audio", "audio"),
    ]);
    const attachmentBlob = new Blob(["legacy-attachment"], { type: "image/jpeg" });
    await database.attachments.add({
      id: "legacy-attachment",
      fragmentId: "source",
      kind: "image",
      blob: attachmentBlob,
      mimeType: attachmentBlob.type,
      fileName: "legacy.jpg",
      sizeBytes: attachmentBlob.size,
      transcript: null,
      extractedText: "历史附件文字",
      createdAt: BACKUP_TEST_TIME,
    });
    await database.externalLinkImports.add(legacyLinkImport);
    await database.chatMessages.add({
      id: "legacy-chat",
      fragmentId: "source",
      role: "assistant",
      content: "历史伙伴消息",
      createdAt: BACKUP_TEST_TIME,
      source: "local",
      status: "completed",
    });
    await database.clusters.add({
      id: "legacy-cluster",
      title: "历史花丛",
      memberFragmentIds: ["source", "child"],
      createdAt: BACKUP_TEST_TIME,
      updatedAt: BACKUP_TEST_TIME,
    });
    await database.recommendations.add({
      id: "legacy-recommendation",
      fragmentId: "source",
      reason: "not_reviewed",
      shownAt: BACKUP_TEST_TIME,
      openedAt: null,
      dismissedAt: null,
    });
    await database.contentProcessingJobs.bulkAdd([
      processingJob("pending-image-job", "image", "processing"),
      processingJob("sprout-preview-job", "sprout", "awaiting_confirmation"),
      processingJob("failed-link-job", "link", "failed"),
    ]);
  });
}
