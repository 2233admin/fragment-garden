import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import type {
  ChatMessage,
  ExternalLinkImport,
  Fragment,
  FragmentEvent,
  FragmentRelation,
  MediaAsset,
  Plant,
  Recommendation,
  Settings,
} from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import {
  FRAGMENT_GARDEN_DATABASE_VERSION_V4,
  FRAGMENT_GARDEN_SCHEMA_V1,
  FRAGMENT_GARDEN_SCHEMA_V3,
  FRAGMENT_GARDEN_SCHEMA_V4,
} from "../../../data/schema";

type LegacyV4Fragment = Omit<Fragment, "contentMarkdown"> & {
  contentMarkdown?: string;
};

const TIMESTAMP = "2026-07-23T08:00:00.000Z";
const databaseNames = new Set<string>();

function createLegacyDatabase(name: string): Dexie {
  databaseNames.add(name);
  const database = new Dexie(name);
  database.version(FRAGMENT_GARDEN_DATABASE_VERSION_V4).stores({
    ...FRAGMENT_GARDEN_SCHEMA_V1,
    ...FRAGMENT_GARDEN_SCHEMA_V3,
    ...FRAGMENT_GARDEN_SCHEMA_V4,
  });
  return database;
}

function fragment(
  id: string,
  contentType: Fragment["contentType"],
  overrides: Partial<LegacyV4Fragment> = {},
): LegacyV4Fragment {
  return {
    id,
    contentType,
    title: `标题 ${id}`,
    rawText: null,
    sourceUrl: null,
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    lastInteractedAt: TIMESTAMP,
    completedAt: null,
    ...overrides,
  };
}

function plant(id: string, fragmentId: string, overrides: Partial<Plant> = {}): Plant {
  return {
    id,
    fragmentId,
    speciesId: "lavender",
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId: "slot-01",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

function event(
  id: string,
  fragmentId: string,
  type: FragmentEvent["type"],
  payload: FragmentEvent["payload"] = null,
): FragmentEvent {
  return {
    id,
    fragmentId,
    type,
    payload,
    occurredAt: TIMESTAMP,
    ruleVersion: 1,
  };
}

function mediaAsset(
  id: string,
  fragmentId: string,
  kind: MediaAsset["kind"],
  overrides: Partial<MediaAsset> = {},
): MediaAsset {
  const mimeType = kind === "image" ? "image/png" : "audio/webm";
  return {
    id,
    fragmentId,
    kind,
    blob: new Blob([`${kind}-blob`], { type: mimeType }),
    mimeType,
    fileName: `${kind}.${kind === "image" ? "png" : "webm"}`,
    sizeBytes: `${kind}-blob`.length,
    width: kind === "image" ? 640 : null,
    height: kind === "image" ? 480 : null,
    durationMs: kind === "audio" ? 12_000 : null,
    processingStatus: "completed",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: null,
    generatedTitle: null,
    summary: null,
    visibleText: null,
    contentKind: null,
    transcript: null,
    originalTranscript: null,
    transcriptEditedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

afterEach(async () => {
  for (const databaseName of databaseNames) {
    await Dexie.delete(databaseName);
  }
  databaseNames.clear();
});

describe("V4 to V5 migration", () => {
  it("preserves historical records and deterministically creates Markdown bodies and user notes", async () => {
    const databaseName = `fragment-garden-v5-migration-${crypto.randomUUID()}`;
    const legacyDatabase = createLegacyDatabase(databaseName);
    await legacyDatabase.open();

    const textFragment = fragment("text-fragment", "text", {
      rawText: "文字第一行\n*保留星号*",
      lifecycleStatus: "dormant",
    });
    const linkFragment = fragment("link-fragment", "link", {
      rawText: "用户保留的链接补充",
      sourceUrl: "https://example.com/reading",
      summary: "链接摘要",
      completionStatus: "completed",
      completedAt: "2026-07-23T09:00:00.000Z",
      analysisStatus: "completed",
    });
    const imageFragment = fragment("image-fragment", "image", {
      rawText: "用户图片补充",
      summary: "旧 Fragment 图片摘要",
      lifecycleStatus: "archived",
      analysisStatus: "completed",
    });
    const audioFragment = fragment("audio-fragment", "audio", {
      rawText: "用户语音补充",
      analysisStatus: "completed",
    });
    const fragments = [textFragment, linkFragment, imageFragment, audioFragment];

    const plants = [
      plant("text-plant", textFragment.id, {
        vitality: "dormant",
        growthScore: 2,
        stage: "growing",
        slotId: "slot-04",
      }),
      plant("link-plant", linkFragment.id, {
        growthScore: 5,
        stage: "permanent_bloom",
        slotId: "slot-05",
      }),
      plant("image-plant", imageFragment.id, {
        growthScore: 1,
        stage: "growing",
        slotId: null,
      }),
      plant("audio-plant", audioFragment.id, { slotId: "slot-06" }),
    ];
    const image = mediaAsset("image-asset", imageFragment.id, "image", {
      summary: "图片摘要",
      visibleText: "图片中的可见文字",
      contentKind: "screenshot",
    });
    const audio = mediaAsset("audio-asset", audioFragment.id, "audio", {
      transcript: "当前编辑后的转写",
      originalTranscript: "原始服务转写",
      transcriptEditedAt: "2026-07-23T08:30:00.000Z",
    });
    const linkImport: ExternalLinkImport = {
      id: "link-import",
      fragmentId: linkFragment.id,
      provider: "getnote",
      sourceUrl: linkFragment.sourceUrl ?? "",
      normalizedUrl: linkFragment.sourceUrl ?? "",
      canonicalUrl: "https://example.com/reading",
      sourceContent: "链接读取后的正文",
      sourceContentTruncated: false,
      status: "completed",
      initiatedBy: "form",
      taskId: "task-1",
      externalNoteId: "note-1",
      providerRequestId: "provider-request-1",
      attemptCount: 1,
      attemptGeneration: 1,
      userProvidedTitle: false,
      userProvidedContent: false,
      errorCode: null,
      errorMessage: null,
      terminalNotificationStatus: "completed",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      startedAt: TIMESTAMP,
      lastPolledAt: TIMESTAMP,
      completedAt: TIMESTAMP,
    };
    const validSupplement = event("valid-supplement", textFragment.id, "text_added", {
      text: "旧用户补充\n第二行",
    });
    const invalidSupplement = event("invalid-supplement", linkFragment.id, "text_added", {
      text: "   ",
    });
    const orphanSupplement = event("orphan-supplement", "missing-fragment", "text_added", {
      text: "孤立补充",
    });
    const partnerSuggestion = event(
      "partner-suggestion",
      imageFragment.id,
      "partner_suggestion_saved",
      {
        direction: "伙伴方向",
        guidingQuestion: "下一步是什么？",
        recommendedAction: "add_content",
        source: "partner",
        promptVersion: "sprout-v1",
        localDateKey: "2026-07-23",
      },
    );
    const createdEvents = fragments.map((item) => event(`created-${item.id}`, item.id, "created"));
    const relation: FragmentRelation = {
      id: "historical-relation",
      sourceFragmentId: textFragment.id,
      targetFragmentId: imageFragment.id,
      relationType: "grows_from",
      status: "confirmed",
      similarityScore: null,
      explanation: null,
      createdAt: TIMESTAMP,
      confirmedAt: TIMESTAMP,
    };
    const recommendation: Recommendation = {
      id: "historical-recommendation",
      fragmentId: textFragment.id,
      reason: "dormant",
      shownAt: TIMESTAMP,
      openedAt: null,
      dismissedAt: null,
    };
    const settings: Settings = {
      id: "local-user",
      onboardingCompleted: true,
      companionType: "cat",
      lastOpenedAt: TIMESTAMP,
      lastRecommendationDate: "2026-07-23",
      getNoteDisclosureAcceptedAt: TIMESTAMP,
      openAiDisclosureAcceptedAt: TIMESTAMP,
      companionAiMode: "local",
      sproutAiDisclosureAcceptedAt: TIMESTAMP,
      imageAiDisclosureAcceptedAt: TIMESTAMP,
      voiceAiDisclosureAcceptedAt: null,
      schemaVersion: 4,
    };
    const message: ChatMessage = {
      id: "historical-message",
      fragmentId: textFragment.id,
      role: "assistant",
      content: "保留的历史消息",
      createdAt: TIMESTAMP,
    };

    await legacyDatabase.table<LegacyV4Fragment>("fragments").bulkAdd(fragments);
    await legacyDatabase.table<Plant>("plants").bulkAdd(plants);
    await legacyDatabase
      .table<FragmentEvent>("fragmentEvents")
      .bulkAdd([
        ...createdEvents,
        validSupplement,
        invalidSupplement,
        orphanSupplement,
        partnerSuggestion,
      ]);
    await legacyDatabase.table<MediaAsset>("mediaAssets").bulkAdd([image, audio]);
    await legacyDatabase.table<ExternalLinkImport>("externalLinkImports").add(linkImport);
    await legacyDatabase.table<FragmentRelation>("relations").add(relation);
    await legacyDatabase.table<Recommendation>("recommendations").add(recommendation);
    await legacyDatabase.table<Settings>("settings").add(settings);
    await legacyDatabase.table<ChatMessage>("chatMessages").add(message);
    legacyDatabase.close();

    const upgradedDatabase = new FragmentGardenDatabase(databaseName);
    await upgradedDatabase.open();

    await expect(upgradedDatabase.fragments.get(textFragment.id)).resolves.toEqual({
      ...textFragment,
      contentMarkdown: "文字第一行  \n\\*保留星号\\*",
    });
    await expect(upgradedDatabase.fragments.get(linkFragment.id)).resolves.toEqual({
      ...linkFragment,
      contentMarkdown: "链接读取后的正文\n\n链接摘要\n\n用户保留的链接补充",
    });
    await expect(upgradedDatabase.fragments.get(imageFragment.id)).resolves.toEqual({
      ...imageFragment,
      contentMarkdown: "图片摘要\n\n图片中的可见文字\n\n用户图片补充",
    });
    await expect(upgradedDatabase.fragments.get(audioFragment.id)).resolves.toEqual({
      ...audioFragment,
      contentMarkdown: "当前编辑后的转写\n\n用户语音补充",
    });

    await expect(upgradedDatabase.plants.toArray()).resolves.toEqual(
      expect.arrayContaining(plants),
    );
    await expect(upgradedDatabase.plants.count()).resolves.toBe(plants.length);
    await expect(upgradedDatabase.externalLinkImports.get(linkImport.id)).resolves.toEqual(
      linkImport,
    );
    await expect(upgradedDatabase.relations.get(relation.id)).resolves.toEqual(relation);
    await expect(upgradedDatabase.recommendations.get(recommendation.id)).resolves.toEqual(
      recommendation,
    );
    await expect(upgradedDatabase.settings.get(settings.id)).resolves.toEqual(settings);
    await expect(upgradedDatabase.chatMessages.get(message.id)).resolves.toEqual(message);
    await expect(upgradedDatabase.fragmentEvents.count()).resolves.toBe(8);
    await expect(upgradedDatabase.fragmentEvents.get(validSupplement.id)).resolves.toEqual(
      validSupplement,
    );
    await expect(upgradedDatabase.fragmentEvents.get(partnerSuggestion.id)).resolves.toEqual(
      partnerSuggestion,
    );

    await expect(upgradedDatabase.fragmentNotes.toArray()).resolves.toEqual([
      {
        id: validSupplement.id,
        fragmentId: textFragment.id,
        contentMarkdown: "旧用户补充  \n第二行",
        source: "user",
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      },
    ]);
    await expect(upgradedDatabase.contentProcessingJobs.count()).resolves.toBe(0);

    const storedImage = await upgradedDatabase.mediaAssets.get(image.id);
    const storedAudio = await upgradedDatabase.mediaAssets.get(audio.id);
    expect(storedImage).toMatchObject({
      id: image.id,
      fragmentId: imageFragment.id,
      summary: image.summary,
      visibleText: image.visibleText,
    });
    expect(storedAudio).toMatchObject({
      id: audio.id,
      fragmentId: audioFragment.id,
      transcript: audio.transcript,
      transcriptEditedAt: audio.transcriptEditedAt,
    });
    await expect(storedImage?.blob.text()).resolves.toBe("image-blob");
    await expect(storedAudio?.blob.text()).resolves.toBe("audio-blob");

    upgradedDatabase.close();
  });

  it("rolls back the version change when legacy data makes the migration fail", async () => {
    const databaseName = `fragment-garden-v5-rollback-${crypto.randomUUID()}`;
    const legacyDatabase = createLegacyDatabase(databaseName);
    await legacyDatabase.open();
    const corruptedFragment = {
      ...fragment("corrupted-fragment", "text", { rawText: null }),
      contentType: "unsupported-content",
    };
    await legacyDatabase.table("fragments").add(corruptedFragment);
    legacyDatabase.close();

    const failedUpgrade = new FragmentGardenDatabase(databaseName);
    await expect(failedUpgrade.open()).rejects.toBeDefined();
    failedUpgrade.close();

    const inspectionDatabase = createLegacyDatabase(databaseName);
    await inspectionDatabase.open();

    expect(inspectionDatabase.verno).toBe(FRAGMENT_GARDEN_DATABASE_VERSION_V4);
    await expect(inspectionDatabase.table("fragments").get(corruptedFragment.id)).resolves.toEqual(
      corruptedFragment,
    );
    expect(Array.from(inspectionDatabase.backendDB().objectStoreNames)).not.toEqual(
      expect.arrayContaining(["fragmentNotes", "contentProcessingJobs"]),
    );
    inspectionDatabase.close();
  });
});
