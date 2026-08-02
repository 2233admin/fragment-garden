import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ExternalLinkImport, MediaAsset } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { listFragmentCardViewModels } from "../../../data/queries/fragment-card-query";
import { getFragmentDetailViewModel } from "../../../data/queries/fragment-detail-query";
import {
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("fragment-queries");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("listFragmentCardViewModels", () => {
  it("joins visible text and link fragments with plants and import status", async () => {
    const visibleFragment = createStageTwoFragment({
      id: "visible-fragment",
      contentMarkdown: "第一行\n第二行",
      rawText: "  第一行\n第二行  ",
    });
    const deletedFragment = createStageTwoFragment({
      id: "deleted-fragment",
      lifecycleStatus: "deleted",
    });
    const linkFragment = createStageTwoFragment({
      id: "link-fragment",
      contentType: "link",
      contentMarkdown: "已经提取的链接摘要",
      rawText: null,
      summary: "已经提取的链接摘要",
      sourceUrl: "https://www.example.com/article",
      analysisStatus: "completed",
    });
    const linkImport: ExternalLinkImport = {
      id: "link-import",
      fragmentId: linkFragment.id,
      provider: "getnote",
      sourceUrl: linkFragment.sourceUrl ?? "",
      normalizedUrl: "https://www.example.com/article",
      canonicalUrl: "https://example.com/article",
      sourceContentTruncated: false,
      status: "completed",
      initiatedBy: "form",
      taskId: "task-1",
      externalNoteId: "9007199254740993",
      providerRequestId: "request-1",
      attemptCount: 1,
      attemptGeneration: 1,
      userProvidedTitle: false,
      userProvidedContent: false,
      errorCode: null,
      errorMessage: null,
      terminalNotificationStatus: null,
      createdAt: linkFragment.createdAt,
      updatedAt: linkFragment.updatedAt,
      startedAt: linkFragment.createdAt,
      lastPolledAt: linkFragment.updatedAt,
      completedAt: linkFragment.updatedAt,
    };

    await database.fragments.bulkAdd([visibleFragment, deletedFragment, linkFragment]);
    await database.plants.bulkAdd([
      createStageTwoPlant({
        id: "visible-plant",
        fragmentId: visibleFragment.id,
        stage: "growing",
        growthScore: 1,
      }),
      createStageTwoPlant({
        id: "deleted-plant",
        fragmentId: deletedFragment.id,
      }),
      createStageTwoPlant({
        id: "link-plant",
        fragmentId: linkFragment.id,
      }),
    ]);
    await database.externalLinkImports.add(linkImport);

    const cards = await listFragmentCardViewModels(database);

    expect(cards).toHaveLength(2);
    expect(cards).toContainEqual(
      expect.objectContaining({
        id: visibleFragment.id,
        plantId: "visible-plant",
        contentType: "text",
        title: visibleFragment.title,
        contentMarkdown: visibleFragment.contentMarkdown,
        rawText: visibleFragment.rawText,
        excerpt: "第一行 第二行",
        searchText: expect.stringContaining("第一行"),
        sourceUrl: null,
        sourceHostname: null,
        analysisStatus: visibleFragment.analysisStatus,
        linkImportStatus: null,
        linkImportErrorMessage: null,
        mediaKind: null,
        mediaProcessingStatus: null,
        mediaSizeBytes: null,
        mediaDurationMs: null,
        mediaBlob: null,
        createdAt: visibleFragment.createdAt,
        updatedAt: visibleFragment.updatedAt,
        lastInteractedAt: visibleFragment.lastInteractedAt,
        lifecycleStatus: visibleFragment.lifecycleStatus,
        completionStatus: visibleFragment.completionStatus,
        plantStage: "growing",
        growthScore: 1,
        isPlacedInGarden: true,
      }),
    );
    expect(cards).toContainEqual(
      expect.objectContaining({
        id: linkFragment.id,
        plantId: "link-plant",
        contentType: "link",
        title: linkFragment.title,
        contentMarkdown: linkFragment.contentMarkdown,
        rawText: "",
        excerpt: linkFragment.summary,
        searchText: expect.stringContaining(linkFragment.sourceUrl ?? ""),
        sourceUrl: linkFragment.sourceUrl,
        sourceHostname: "example.com",
        analysisStatus: "completed",
        linkImportStatus: "completed",
        linkImportErrorMessage: null,
        mediaKind: null,
        mediaProcessingStatus: null,
        mediaSizeBytes: null,
        mediaDurationMs: null,
        mediaBlob: null,
        createdAt: linkFragment.createdAt,
        updatedAt: linkFragment.updatedAt,
        lastInteractedAt: linkFragment.lastInteractedAt,
        lifecycleStatus: linkFragment.lifecycleStatus,
        completionStatus: linkFragment.completionStatus,
        plantStage: "seedling",
        growthScore: 0,
        isPlacedInGarden: true,
      }),
    );
  });

  it("reports the broken Fragment-to-Plant invariant instead of hiding content", async () => {
    await database.fragments.add(createStageTwoFragment({ id: "fragment-without-plant" }));

    await expect(listFragmentCardViewModels(database)).rejects.toThrow("Plant not found");
  });

  it("limits long card content to a stable 120-character preview", async () => {
    const longFragment = createStageTwoFragment({
      id: "long-fragment",
      contentMarkdown: "长".repeat(500),
      rawText: null,
    });
    await database.fragments.add(longFragment);
    await database.plants.add(
      createStageTwoPlant({ id: "long-plant", fragmentId: longFragment.id }),
    );

    const [card] = await listFragmentCardViewModels(database);
    expect(card?.excerpt).toHaveLength(120);
    expect(card?.excerpt.endsWith("…")).toBe(true);
    expect(card?.excerpt).not.toContain("长".repeat(200));
  });

  it("keeps historical voice fragments and their local media available", async () => {
    const fragment = createStageTwoFragment({
      id: "voice-fragment",
      contentType: "audio",
      title: "一段旧录音",
      rawText: null,
    });
    const plant = createStageTwoPlant({ id: "voice-plant", fragmentId: fragment.id });
    const mediaAsset: MediaAsset = {
      id: "voice-asset",
      fragmentId: fragment.id,
      kind: "audio",
      blob: new Blob(["historical voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      fileName: "voice-recording.webm",
      sizeBytes: 16,
      width: null,
      height: null,
      durationMs: 12_000,
      processingStatus: "completed",
      processingRequestId: null,
      errorCode: null,
      temporaryTitle: null,
      generatedTitle: null,
      summary: null,
      visibleText: null,
      contentKind: null,
      transcript: "这是已经保存的转写。",
      originalTranscript: "这是已经保存的转写。",
      transcriptEditedAt: null,
      createdAt: fragment.createdAt,
      updatedAt: fragment.updatedAt,
    };

    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.mediaAssets.add(mediaAsset);

    await expect(listFragmentCardViewModels(database)).resolves.toEqual([
      expect.objectContaining({
        id: fragment.id,
        contentType: "audio",
        mediaKind: "audio",
        mediaBlob: null,
        mediaDurationMs: null,
        mediaProcessingStatus: null,
      }),
    ]);

    const detail = await getFragmentDetailViewModel(fragment.id, database);
    expect(detail?.mediaAsset).toEqual(mediaAsset);
    await expect(detail?.mediaAsset?.blob.text()).resolves.toBe("historical voice");
    expect(detail?.mediaAsset?.transcript).toBe("这是已经保存的转写。");
  });
});

describe("getFragmentDetailViewModel", () => {
  it("returns validated text supplements in stable occurrence order", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.bulkAdd([
      createStageTwoEvent("text_added", {
        id: "event-b",
        payload: { text: "第二条" },
        occurredAt: "2026-07-24T09:00:00.000Z",
      }),
      createStageTwoEvent("text_added", {
        id: "event-a",
        payload: { text: "第一条" },
        occurredAt: "2026-07-24T09:00:00.000Z",
      }),
      createStageTwoEvent("text_added", {
        id: "invalid-event",
        payload: { unexpected: true },
        occurredAt: "2026-07-24T10:00:00.000Z",
      }),
      createStageTwoEvent("partner_suggestion_saved", {
        id: "partner-suggestion",
        payload: {
          direction: "先观察最容易分心的一个时段",
          guidingQuestion: "哪个时段最值得先记录？",
          recommendedAction: "record_next_step",
          source: "partner",
          promptVersion: "sprout-v1",
          localDateKey: "2026-07-24",
        },
        occurredAt: "2026-07-24T09:30:00.000Z",
      }),
      createStageTwoEvent("partner_suggestion_saved", {
        id: "invalid-partner-suggestion",
        payload: { direction: "缺少其余字段" },
        occurredAt: "2026-07-24T10:30:00.000Z",
      }),
      createStageTwoEvent("viewed", {
        id: "viewed-event",
        occurredAt: "2026-07-24T11:00:00.000Z",
      }),
    ]);

    await expect(getFragmentDetailViewModel(fragment.id, database)).resolves.toEqual({
      fragment,
      contentMarkdown: fragment.contentMarkdown,
      notes: [],
      plant,
      externalLinkImport: null,
      textSupplements: [
        {
          id: "event-a",
          text: "第一条",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
        {
          id: "event-b",
          text: "第二条",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
      ],
      additions: [
        {
          id: "event-a",
          source: "user",
          content: "第一条",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
        {
          id: "event-b",
          source: "user",
          content: "第二条",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
        {
          id: "partner-suggestion",
          source: "partner",
          content:
            "具体化方向：先观察最容易分心的一个时段\n引导问题：哪个时段最值得先记录？\n推荐动作：record_next_step",
          direction: "先观察最容易分心的一个时段",
          guidingQuestion: "哪个时段最值得先记录？",
          recommendedAction: "record_next_step",
          promptVersion: "sprout-v1",
          occurredAt: "2026-07-24T09:30:00.000Z",
        },
      ],
      completion: null,
      history: [
        {
          id: "event-a",
          label: "补充了一段新内容",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
        {
          id: "event-b",
          label: "补充了一段新内容",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
        {
          id: "partner-suggestion",
          label: "保存了一条伙伴建议",
          occurredAt: "2026-07-24T09:30:00.000Z",
        },
      ],
      sourceFragment: null,
      childFragments: [],
      mediaAsset: null,
    });
  });

  it("returns the external import record for a link detail", async () => {
    const fragment = createStageTwoFragment({
      contentType: "link",
      rawText: null,
      sourceUrl: "https://example.com/article",
      analysisStatus: "pending",
    });
    const plant = createStageTwoPlant();
    const externalLinkImport: ExternalLinkImport = {
      id: "link-import",
      fragmentId: fragment.id,
      provider: "getnote",
      sourceUrl: fragment.sourceUrl ?? "",
      normalizedUrl: fragment.sourceUrl ?? "",
      canonicalUrl: null,
      sourceContent: null,
      sourceContentTruncated: false,
      status: "processing",
      initiatedBy: "form",
      taskId: "task-1",
      externalNoteId: null,
      providerRequestId: "request-1",
      attemptCount: 1,
      attemptGeneration: 1,
      userProvidedTitle: false,
      userProvidedContent: false,
      errorCode: null,
      errorMessage: null,
      terminalNotificationStatus: null,
      createdAt: fragment.createdAt,
      updatedAt: fragment.updatedAt,
      startedAt: fragment.createdAt,
      lastPolledAt: fragment.updatedAt,
      completedAt: null,
    };
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.externalLinkImports.add(externalLinkImport);

    const detail = await getFragmentDetailViewModel(fragment.id, database);

    expect(detail?.externalLinkImport).toEqual(externalLinkImport);
  });

  it("returns completion and confirmed grows-from relationships without exposing payload records", async () => {
    const parent = createStageTwoFragment({
      id: "parent-fragment",
      title: "来源想法",
    });
    const child = createStageTwoFragment({
      id: "child-fragment",
      title: "长出的想法",
      parentFragmentId: parent.id,
      completionStatus: "completed",
      completedAt: "2026-07-25T09:00:00.000Z",
    });
    await database.fragments.bulkAdd([parent, child]);
    await database.plants.bulkAdd([
      createStageTwoPlant({ id: "parent-plant", fragmentId: parent.id }),
      createStageTwoPlant({ id: "child-plant", fragmentId: child.id }),
    ]);
    await database.relations.add({
      id: "relation-1",
      sourceFragmentId: child.id,
      targetFragmentId: parent.id,
      relationType: "grows_from",
      status: "confirmed",
      similarityScore: null,
      explanation: null,
      createdAt: "2026-07-24T09:00:00.000Z",
      confirmedAt: "2026-07-24T09:00:00.000Z",
    });
    await database.fragmentEvents.bulkAdd([
      createStageTwoEvent("child_fragment_created", {
        id: "child-created",
        fragmentId: parent.id,
        payload: { childFragmentId: child.id },
      }),
      createStageTwoEvent("completed", {
        id: "completed",
        fragmentId: child.id,
        payload: { outcome: "成为了一个可执行方案" },
        occurredAt: "2026-07-25T09:00:00.000Z",
      }),
      createStageTwoEvent("reviewed", {
        id: "invalid-review",
        fragmentId: child.id,
        payload: { decision: "unexpected" },
      }),
    ]);

    const parentDetail = await getFragmentDetailViewModel(parent.id, database);
    const childDetail = await getFragmentDetailViewModel(child.id, database);

    expect(parentDetail?.childFragments).toEqual([{ id: child.id, title: child.title }]);
    expect(parentDetail?.history).toContainEqual({
      id: "child-created",
      label: "它发展出了一个新想法",
      occurredAt: "2026-07-23T08:30:00.000Z",
    });
    expect(childDetail?.sourceFragment).toEqual({ id: parent.id, title: parent.title });
    expect(childDetail?.completion).toEqual({
      outcome: "成为了一个可执行方案",
      occurredAt: "2026-07-25T09:00:00.000Z",
    });
    expect(childDetail?.history).toEqual([
      {
        id: "completed",
        label: "这株植物已经永久盛开",
        occurredAt: "2026-07-25T09:00:00.000Z",
      },
    ]);
  });

  it("falls back to completedAt when a historical completion payload is malformed", async () => {
    const fragment = createStageTwoFragment({
      completionStatus: "completed",
      completedAt: "2026-07-25T09:00:00.000Z",
    });
    await database.fragments.add(fragment);
    await database.plants.add(createStageTwoPlant());
    await database.fragmentEvents.add(
      createStageTwoEvent("completed", {
        payload: { outcome: 42 },
        occurredAt: fragment.completedAt ?? undefined,
      }),
    );

    const detail = await getFragmentDetailViewModel(fragment.id, database);

    expect(detail?.completion).toEqual({
      outcome: null,
      occurredAt: fragment.completedAt,
    });
    expect(detail?.history).toEqual([]);
  });

  it("returns undefined when the fragment does not exist", async () => {
    await expect(getFragmentDetailViewModel("missing-fragment", database)).resolves.toBeUndefined();
  });
});
