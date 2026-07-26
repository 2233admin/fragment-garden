import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLANT_SLOT_IDS,
  type Fragment,
  type FragmentNote,
  type MediaAsset,
  type Plant,
} from "../../../domain";
import { getFragmentDetailViewModel } from "../../../data/queries/fragment-detail-query";
import { FragmentGardenDatabase } from "../../../data/db";
import { SproutGenerationApiClient } from "../../../services/sprout-generation-api-client";
import {
  cancelSproutGenerationJob,
  confirmSproutGeneration,
  createSproutGenerationJob,
  markStaleSproutGenerationJobs,
  parseSproutJobSnapshot,
  processSproutGenerationJob,
} from "../../../services/sprout-generation-jobs";
import {
  createIdSequence,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "../data/stage-two-fixtures";

const CREATED_AT = "2026-07-25T08:00:00.000Z";
const GENERATED_AT = "2026-07-25T08:05:00.000Z";
const CONFIRMED_AT = "2026-07-25T08:10:00.000Z";
const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "22222222-2222-4222-8222-222222222222";
const AUDIO_ID = "33333333-3333-4333-8333-333333333333";

let database: FragmentGardenDatabase;

function sourceFragment(overrides: Partial<Fragment> = {}): Fragment {
  return createStageTwoFragment({
    id: SOURCE_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    lastInteractedAt: CREATED_AT,
    ...overrides,
  });
}

function sourcePlant(overrides: Partial<Plant> = {}): Plant {
  return createStageTwoPlant({
    id: "source-plant",
    fragmentId: SOURCE_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  });
}

function userNote(overrides: Partial<FragmentNote> = {}): FragmentNote {
  return {
    id: "note-1",
    fragmentId: SOURCE_ID,
    contentMarkdown: "第一条用户追加",
    source: "user",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

function mediaAsset(
  fragmentId: string,
  kind: "image" | "audio",
  overrides: Partial<MediaAsset> = {},
): MediaAsset {
  const blob = new Blob([`${kind}-binary-secret`], {
    type: kind === "image" ? "image/png" : "audio/webm",
  });
  return {
    id: `asset-${fragmentId}`,
    fragmentId,
    kind,
    blob,
    mimeType: blob.type,
    fileName: kind === "image" ? "garden.png" : "idea.webm",
    sizeBytes: blob.size,
    width: kind === "image" ? 640 : null,
    height: kind === "image" ? 480 : null,
    durationMs: kind === "audio" ? 12_000 : null,
    processingStatus: "completed",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: null,
    generatedTitle: null,
    summary: kind === "image" ? "一张活动安排截图。" : null,
    visibleText: kind === "image" ? "周六下午三点" : null,
    contentKind: kind === "image" ? "screenshot" : null,
    transcript: kind === "audio" ? "编辑后的语音转写" : null,
    originalTranscript: kind === "audio" ? "原始语音转写" : null,
    transcriptEditedAt: kind === "audio" ? GENERATED_AT : null,
    createdAt: CREATED_AT,
    updatedAt: GENERATED_AT,
    ...overrides,
  };
}

async function seedTextSource(
  fragmentOverrides: Partial<Fragment> = {},
  plantOverrides: Partial<Plant> = {},
): Promise<void> {
  await database.fragments.add(sourceFragment(fragmentOverrides));
  await database.plants.add(sourcePlant(plantOverrides));
  await database.fragmentEvents.add(
    createStageTwoEvent("created", {
      id: "source-created",
      occurredAt: CREATED_AT,
    }),
  );
}

function successfulClient(capture?: (request: unknown) => void): SproutGenerationApiClient {
  return new SproutGenerationApiClient(
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capture?.(JSON.parse(String(init?.body)) as unknown);
      return new Response(
        JSON.stringify({
          title: "第一次阅读活动",
          markdown: "## 活动轮廓\n\n先邀请六个人读一篇短文。",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
    () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
}

async function createAndProcessJob(jobId = "sprout-job") {
  await createSproutGenerationJob(SOURCE_ID, {
    database,
    createId: () => jobId,
    now: () => new Date(CREATED_AT),
  });
  return processSproutGenerationJob(jobId, {
    apiClient: successfulClient(),
    dependencies: {
      database,
      createId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      now: () => new Date(GENERATED_AT),
    },
  });
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-sprout-generation-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

describe("sprout generation jobs", () => {
  it("creates only one reusable local job from the selected note and all user additions", async () => {
    await seedTextSource();
    await database.fragmentNotes.bulkAdd([
      userNote(),
      userNote({
        id: "note-2",
        contentMarkdown: "第二条用户追加",
        createdAt: "2026-07-25T09:00:00.000Z",
      }),
    ]);
    await database.fragmentEvents.add(
      createStageTwoEvent("partner_suggestion_saved", {
        id: "partner-event",
        payload: {
          direction: "不应发送的伙伴方向",
          guidingQuestion: "不应发送的问题",
          recommendedAction: "add_content",
          source: "partner",
          promptVersion: "legacy",
          localDateKey: "2026-07-25",
        },
      }),
    );
    await database.fragments.add(
      sourceFragment({
        id: "other-fragment",
        title: "其他笔记",
        contentMarkdown: "不应发送的其他笔记正文",
      }),
    );
    await database.fragments.add(
      sourceFragment({
        id: "child-fragment",
        title: "既有发芽笔记",
        parentFragmentId: SOURCE_ID,
      }),
    );
    await database.relations.add({
      id: "existing-relation",
      sourceFragmentId: "child-fragment",
      targetFragmentId: SOURCE_ID,
      relationType: "grows_from",
      status: "confirmed",
      similarityScore: null,
      explanation: null,
      createdAt: CREATED_AT,
      confirmedAt: CREATED_AT,
    });
    const before = {
      fragments: await database.fragments.count(),
      plants: await database.plants.count(),
      events: await database.fragmentEvents.count(),
      relations: await database.relations.count(),
    };

    const created = await createSproutGenerationJob(SOURCE_ID, {
      database,
      createId: () => "sprout-job",
      now: () => new Date(CREATED_AT),
    });
    const reused = await createSproutGenerationJob(SOURCE_ID, {
      database,
      createId: () => "must-not-be-used",
      now: () => new Date(CREATED_AT),
    });
    const snapshot = parseSproutJobSnapshot(created.job);

    expect(created.kind).toBe("created");
    expect(reused).toMatchObject({ kind: "existing", job: { id: "sprout-job" } });
    expect(snapshot.request.source).toMatchObject({
      id: SOURCE_ID,
      title: "原始标题",
      contentMarkdown: "原始正文",
      notes: [{ contentMarkdown: "第一条用户追加" }, { contentMarkdown: "第二条用户追加" }],
      existingSproutTitles: ["既有发芽笔记"],
    });
    expect(created.job.sourceSnapshot).not.toContain("不应发送的伙伴方向");
    expect(created.job.sourceSnapshot).not.toContain("不应发送的其他笔记正文");
    expect(await database.contentProcessingJobs.count()).toBe(1);
    await expect(database.fragments.count()).resolves.toBe(before.fragments);
    await expect(database.plants.count()).resolves.toBe(before.plants);
    await expect(database.fragmentEvents.count()).resolves.toBe(before.events);
    await expect(database.relations.count()).resolves.toBe(before.relations);
  });

  it("sends image analysis and edited audio transcript as text without either Blob", async () => {
    const image = sourceFragment({
      id: IMAGE_ID,
      contentType: "image",
      title: "图片笔记",
      rawText: null,
      contentMarkdown: "## 图片整理\n\n一张活动安排截图。\n\n周六下午三点",
    });
    const audio = sourceFragment({
      id: AUDIO_ID,
      contentType: "audio",
      title: "语音笔记",
      rawText: null,
      contentMarkdown: "不应替代当前编辑后的转写",
    });
    await database.fragments.bulkAdd([image, audio]);
    await database.plants.bulkAdd([
      sourcePlant({ id: "image-plant", fragmentId: image.id, slotId: "slot-01" }),
      sourcePlant({ id: "audio-plant", fragmentId: audio.id, slotId: "slot-02" }),
    ]);
    await database.mediaAssets.bulkAdd([
      mediaAsset(image.id, "image"),
      mediaAsset(audio.id, "audio"),
    ]);
    await database.fragmentNotes.add(
      userNote({ id: "audio-note", fragmentId: audio.id, contentMarkdown: "语音用户追加" }),
    );

    const imageJob = await createSproutGenerationJob(image.id, {
      database,
      createId: () => "image-sprout-job",
    });
    const audioJob = await createSproutGenerationJob(audio.id, {
      database,
      createId: () => "audio-sprout-job",
    });
    const imageSnapshot = parseSproutJobSnapshot(imageJob.job);
    const audioSnapshot = parseSproutJobSnapshot(audioJob.job);

    expect(imageSnapshot.request.source).toMatchObject({
      sourceType: "image",
      sourceName: "garden.png",
      contentMarkdown: "## 图片整理\n\n一张活动安排截图。\n\n周六下午三点",
    });
    expect(audioSnapshot.request.source).toMatchObject({
      sourceType: "voice",
      sourceName: "idea.webm",
      contentMarkdown: "编辑后的语音转写",
      notes: [{ contentMarkdown: "语音用户追加" }],
    });
    for (const job of [imageJob.job, audioJob.job]) {
      expect(job.sourceBlob).toBeNull();
      expect(job.sourceSnapshot).not.toContain("binary-secret");
      expect(job.sourceSnapshot).not.toContain('"blob"');
    }
    expect(audioJob.job.sourceSnapshot).not.toContain("原始语音转写");
    expect(audioJob.job.sourceSnapshot).not.toContain("不应替代当前编辑后的转写");
  });

  it("keeps generation temporary until confirmation, then creates one linked note idempotently", async () => {
    await seedTextSource();
    await database.fragmentNotes.add(userNote());
    const sourceBefore = await database.fragments.get(SOURCE_ID);
    const sourcePlantBefore = await database.plants.get("source-plant");

    const processed = await createAndProcessJob();

    expect(processed).toMatchObject({
      status: "awaiting_confirmation",
      resultTitle: "第一次阅读活动",
    });
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.relations.count()).resolves.toBe(0);

    const confirmed = await confirmSproutGeneration(
      {
        jobId: "sprout-job",
        title: "编辑后的活动标题",
        markdown: "## 编辑后的正文\n\n只保留确认后的版本。",
        now: CONFIRMED_AT,
      },
      {
        database,
        createId: createIdSequence([
          "new-fragment",
          "new-plant",
          "new-created-event",
          "new-relation",
        ]),
      },
    );
    const repeated = await confirmSproutGeneration(
      {
        jobId: "sprout-job",
        title: "不应覆盖",
        markdown: "不应覆盖",
        now: CONFIRMED_AT,
      },
      {
        database,
        createId: () => {
          throw new Error("idempotent confirmation must not allocate IDs");
        },
      },
    );

    expect(confirmed).toEqual({ created: true, fragmentId: "new-fragment" });
    expect(repeated).toEqual({ created: false, fragmentId: "new-fragment" });
    await expect(database.fragments.get("new-fragment")).resolves.toMatchObject({
      contentType: "text",
      title: "编辑后的活动标题",
      contentMarkdown: "## 编辑后的正文\n\n只保留确认后的版本。",
      parentFragmentId: SOURCE_ID,
    });
    await expect(database.plants.get("new-plant")).resolves.toMatchObject({
      fragmentId: "new-fragment",
      growthScore: 0,
      stage: "seedling",
      slotId: "slot-02",
    });
    await expect(database.relations.toArray()).resolves.toEqual([
      expect.objectContaining({
        id: "new-relation",
        sourceFragmentId: "new-fragment",
        targetFragmentId: SOURCE_ID,
        relationType: "grows_from",
        status: "confirmed",
      }),
    ]);
    const events = await database.fragmentEvents.toArray();
    expect(events.filter((event) => event.fragmentId === "new-fragment")).toEqual([
      expect.objectContaining({ type: "created" }),
    ]);
    expect(events.some((event) => event.type === "child_fragment_created")).toBe(false);
    expect(events.some((event) => event.type === "partner_suggestion_saved")).toBe(false);
    await expect(database.fragments.get(SOURCE_ID)).resolves.toMatchObject({
      title: sourceBefore?.title,
      rawText: sourceBefore?.rawText,
      contentMarkdown: sourceBefore?.contentMarkdown,
    });
    await expect(database.plants.get("source-plant")).resolves.toMatchObject({
      growthScore: sourcePlantBefore?.growthScore,
      stage: sourcePlantBefore?.stage,
    });
    await expect(database.fragments.count()).resolves.toBe(2);
    await expect(database.plants.count()).resolves.toBe(2);
    await expect(database.relations.count()).resolves.toBe(1);

    const sourceDetail = await getFragmentDetailViewModel(SOURCE_ID, database);
    const childDetail = await getFragmentDetailViewModel("new-fragment", database);
    expect(sourceDetail?.childFragments).toEqual([
      { id: "new-fragment", title: "编辑后的活动标题" },
    ]);
    expect(childDetail?.sourceFragment).toEqual({ id: SOURCE_ID, title: "原始标题" });
  });

  it("creates the confirmed note without a slot when the garden is full", async () => {
    await seedTextSource({}, { slotId: "slot-01" });
    await database.plants.bulkAdd(
      PLANT_SLOT_IDS.slice(1).map((slotId, index) =>
        sourcePlant({
          id: `occupied-plant-${index}`,
          fragmentId: `occupied-fragment-${index}`,
          slotId,
        }),
      ),
    );
    await createAndProcessJob("full-job");

    const result = await confirmSproutGeneration(
      { jobId: "full-job", title: "无空位也保存", markdown: "完整正文" },
      {
        database,
        createId: createIdSequence([
          "full-fragment",
          "full-plant",
          "full-created",
          "full-relation",
        ]),
      },
    );

    expect(result.created).toBe(true);
    await expect(database.plants.get("full-plant")).resolves.toMatchObject({ slotId: null });
    await expect(database.fragments.get("full-fragment")).resolves.toBeDefined();
  });

  it("rolls back confirmation completely when the relation write fails", async () => {
    await seedTextSource();
    await createAndProcessJob("rollback-job");
    vi.spyOn(database.relations, "add").mockRejectedValueOnce(
      new Error("simulated relation failure"),
    );

    await expect(
      confirmSproutGeneration(
        { jobId: "rollback-job", title: "不会部分保存", markdown: "不会部分保存" },
        {
          database,
          createId: createIdSequence([
            "rollback-fragment",
            "rollback-plant",
            "rollback-event",
            "rollback-relation",
          ]),
        },
      ),
    ).rejects.toThrow("simulated relation failure");

    await expect(database.fragments.get("rollback-fragment")).resolves.toBeUndefined();
    await expect(database.plants.get("rollback-plant")).resolves.toBeUndefined();
    await expect(database.fragmentEvents.get("rollback-event")).resolves.toBeUndefined();
    await expect(database.relations.count()).resolves.toBe(0);
    await expect(database.contentProcessingJobs.get("rollback-job")).resolves.toMatchObject({
      status: "awaiting_confirmation",
      createdFragmentId: null,
    });
    await expect(database.fragments.get(SOURCE_ID)).resolves.toMatchObject({
      updatedAt: CREATED_AT,
      lastInteractedAt: CREATED_AT,
    });
  });

  it("cancels without formal writes and ignores the response that arrives later", async () => {
    await seedTextSource();
    await createSproutGenerationJob(SOURCE_ID, {
      database,
      createId: () => "cancelled-job",
    });
    let resolveResponse: (response: Response) => void = () => undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const processing = processSproutGenerationJob("cancelled-job", {
      apiClient: new SproutGenerationApiClient(vi.fn(() => responsePromise)),
      dependencies: {
        database,
        createId: () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    });
    await vi.waitFor(async () => {
      await expect(database.contentProcessingJobs.get("cancelled-job")).resolves.toMatchObject({
        status: "processing",
      });
    });

    await cancelSproutGenerationJob("cancelled-job", { database });
    resolveResponse(
      new Response(JSON.stringify({ title: "迟到标题", markdown: "迟到正文" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(processing).resolves.toBeNull();
    await expect(database.contentProcessingJobs.get("cancelled-job")).resolves.toMatchObject({
      status: "cancelled",
      resultTitle: null,
    });
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.relations.count()).resolves.toBe(0);
  });

  it("does not write a late result after the selected source is deleted", async () => {
    await seedTextSource();
    await createSproutGenerationJob(SOURCE_ID, {
      database,
      createId: () => "deleted-source-job",
    });
    let resolveResponse: (response: Response) => void = () => undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const processing = processSproutGenerationJob("deleted-source-job", {
      apiClient: new SproutGenerationApiClient(vi.fn(() => responsePromise)),
      dependencies: {
        database,
        createId: () => "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        now: () => new Date(GENERATED_AT),
      },
    });
    await vi.waitFor(async () => {
      await expect(database.contentProcessingJobs.get("deleted-source-job")).resolves.toMatchObject(
        {
          status: "processing",
        },
      );
    });
    await database.fragments.update(SOURCE_ID, { lifecycleStatus: "deleted" });
    resolveResponse(
      new Response(JSON.stringify({ title: "迟到标题", markdown: "迟到正文" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(processing).resolves.toMatchObject({
      status: "failed",
      errorCode: "source_missing",
      resultTitle: null,
    });
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.relations.count()).resolves.toBe(0);
  });

  it("marks stale processing as retryable without creating content", async () => {
    await seedTextSource();
    await createSproutGenerationJob(SOURCE_ID, {
      database,
      createId: () => "stale-job",
      now: () => new Date(CREATED_AT),
    });
    await database.contentProcessingJobs.update("stale-job", {
      status: "processing",
      processingRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      updatedAt: CREATED_AT,
    });

    await expect(
      markStaleSproutGenerationJobs(new Date(GENERATED_AT), {
        database,
        now: () => new Date(GENERATED_AT),
      }),
    ).resolves.toBe(1);
    await expect(database.contentProcessingJobs.get("stale-job")).resolves.toMatchObject({
      status: "failed",
      processingRequestId: null,
      errorCode: "request_timeout",
    });
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
  });
});
