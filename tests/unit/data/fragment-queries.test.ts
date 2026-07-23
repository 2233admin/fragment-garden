import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ExternalLinkImport } from "../../../domain";
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
      rawText: "  第一行\n第二行  ",
    });
    const deletedFragment = createStageTwoFragment({
      id: "deleted-fragment",
      lifecycleStatus: "deleted",
    });
    const linkFragment = createStageTwoFragment({
      id: "link-fragment",
      contentType: "link",
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
    expect(cards).toContainEqual({
      id: visibleFragment.id,
      plantId: "visible-plant",
      contentType: "text",
      title: visibleFragment.title,
      rawText: visibleFragment.rawText,
      excerpt: "第一行 第二行",
      searchText: visibleFragment.rawText,
      sourceUrl: null,
      sourceHostname: null,
      analysisStatus: visibleFragment.analysisStatus,
      linkImportStatus: null,
      linkImportErrorMessage: null,
      createdAt: visibleFragment.createdAt,
      lastInteractedAt: visibleFragment.lastInteractedAt,
      lifecycleStatus: visibleFragment.lifecycleStatus,
      completionStatus: visibleFragment.completionStatus,
      plantStage: "growing",
      growthScore: 1,
      isPlacedInGarden: true,
    });
    expect(cards).toContainEqual({
      id: linkFragment.id,
      plantId: "link-plant",
      contentType: "link",
      title: linkFragment.title,
      rawText: "",
      excerpt: linkFragment.summary,
      searchText: `${linkFragment.summary} ${linkFragment.sourceUrl}`,
      sourceUrl: linkFragment.sourceUrl,
      sourceHostname: "example.com",
      analysisStatus: "completed",
      linkImportStatus: "completed",
      linkImportErrorMessage: null,
      createdAt: linkFragment.createdAt,
      lastInteractedAt: linkFragment.lastInteractedAt,
      lifecycleStatus: linkFragment.lifecycleStatus,
      completionStatus: linkFragment.completionStatus,
      plantStage: "seedling",
      growthScore: 0,
      isPlacedInGarden: true,
    });
  });

  it("reports the broken Fragment-to-Plant invariant instead of hiding content", async () => {
    await database.fragments.add(createStageTwoFragment({ id: "fragment-without-plant" }));

    await expect(listFragmentCardViewModels(database)).rejects.toThrow("Plant not found");
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
      createStageTwoEvent("viewed", {
        id: "viewed-event",
        occurredAt: "2026-07-24T11:00:00.000Z",
      }),
    ]);

    await expect(getFragmentDetailViewModel(fragment.id, database)).resolves.toEqual({
      fragment,
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
      ],
      sourceFragment: null,
      childFragments: [],
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
