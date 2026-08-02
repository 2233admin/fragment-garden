import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FragmentEvent, Plant } from "../../../domain";
import { createLocalLinkFragment } from "../../../services/create-local-link-fragment";
import {
  completeLinkProcessingJob,
  failLinkProcessingJob,
  type CompleteLinkProcessingJobInput,
} from "../../../services/finalize-link-processing-job";
import {
  PROCESSING_JOB_TEST_NOW,
  createCompletedJobImportResponse,
  createContentProcessingJobDatabase,
  createLinkProcessingJobRecord,
} from "./content-processing-job-fixtures";

const FINISHED_AT = "2026-07-26T08:01:00.000Z";

let database = createContentProcessingJobDatabase("finalize-placeholder");

beforeEach(async () => {
  database = createContentProcessingJobDatabase("finalize");
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

function ids(values: readonly string[]): () => string {
  let index = 0;
  return () => values[index++] ?? `unexpected-${index}`;
}

function completeInput(jobId: string, key = "success"): CompleteLinkProcessingJobInput {
  return {
    jobId,
    ...createCompletedJobImportResponse(key),
    attempt: { attemptGeneration: 1, providerTaskId: "provider-task-1" },
    now: FINISHED_AT,
  };
}

describe("completeLinkProcessingJob", () => {
  it("atomically creates the formal link records only after success", async () => {
    const job = createLinkProcessingJobRecord({
      status: "processing",
      userTitle: "我的标题",
      userNoteMarkdown: "我的补充",
    });
    await database.contentProcessingJobs.add(job);

    const result = await completeLinkProcessingJob(completeInput(job.id), {
      database,
      createId: ids(["fragment-new", "plant-new", "event-new", "import-new"]),
    });

    expect(result).toMatchObject({
      didFinalize: true,
      didCreateFragment: true,
      fragment: {
        id: "fragment-new",
        title: "我的标题",
        sourceUrl: job.sourceUrl,
        analysisStatus: "completed",
      },
      plant: { id: "plant-new", fragmentId: "fragment-new", growthScore: 0 },
      createdEvent: { id: "event-new", type: "created" },
      externalLinkImport: {
        id: "import-new",
        fragmentId: "fragment-new",
        status: "completed",
        normalizedUrl: job.normalizedSourceUrl,
      },
      job: {
        status: "completed",
        createdFragmentId: "fragment-new",
        resultTitle: "我的标题",
      },
    });
    expect(result.fragment?.contentMarkdown).toContain("## 我的补充");
    expect(result.fragment?.contentMarkdown).toContain("## 正文");
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.fragmentEvents.count()).resolves.toBe(1);
    await expect(database.externalLinkImports.count()).resolves.toBe(1);
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "completed",
      createdFragmentId: "fragment-new",
    });
  });

  it("creates a plant with no slot when all 36 garden slots are occupied", async () => {
    const job = createLinkProcessingJobRecord({ status: "processing" });
    const occupiedPlants: Plant[] = Array.from({ length: 36 }, (_, index) => ({
      id: `occupied-plant-${index}`,
      fragmentId: `occupied-fragment-${index}`,
      speciesId: null,
      stage: "seedling",
      vitality: "active",
      growthScore: 0,
      slotId: `slot-${String(index + 1).padStart(2, "0")}`,
      createdAt: PROCESSING_JOB_TEST_NOW,
      updatedAt: PROCESSING_JOB_TEST_NOW,
    }));
    await database.transaction("rw", database.contentProcessingJobs, database.plants, async () => {
      await database.contentProcessingJobs.add(job);
      await database.plants.bulkAdd(occupiedPlants);
    });

    const result = await completeLinkProcessingJob(completeInput(job.id, "no-slot"), {
      database,
      createId: ids(["fragment-no-slot", "plant-no-slot", "event-no-slot", "import-no-slot"]),
    });
    expect(result.plant?.slotId).toBeNull();
    await expect(database.fragments.get("fragment-no-slot")).resolves.toBeDefined();
  });

  it("does not create formal data when provider content is insufficient", async () => {
    const job = createLinkProcessingJobRecord({ status: "processing" });
    await database.contentProcessingJobs.add(job);

    await expect(
      completeLinkProcessingJob(
        {
          ...completeInput(job.id, "empty"),
          title: "小红书",
          summary: "",
          sourceContent: "",
        },
        { database },
      ),
    ).rejects.toMatchObject({ code: "insufficient_content" });
    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.externalLinkImports.count()).resolves.toBe(0);
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "processing",
    });
  });

  it("rolls back Fragment and Plant when a later write fails", async () => {
    const job = createLinkProcessingJobRecord({ status: "processing" });
    const conflictingEvent: FragmentEvent = {
      id: "event-conflict",
      fragmentId: "historical-fragment",
      type: "created",
      payload: null,
      occurredAt: PROCESSING_JOB_TEST_NOW,
      ruleVersion: 1,
    };
    await database.transaction(
      "rw",
      database.contentProcessingJobs,
      database.fragmentEvents,
      async () => {
        await database.contentProcessingJobs.add(job);
        await database.fragmentEvents.add(conflictingEvent);
      },
    );

    await expect(
      completeLinkProcessingJob(completeInput(job.id, "rollback"), {
        database,
        createId: ids(["fragment-rollback", "plant-rollback", "event-conflict", "import-rollback"]),
      }),
    ).rejects.toBeDefined();
    await expect(database.fragments.get("fragment-rollback")).resolves.toBeUndefined();
    await expect(database.plants.get("plant-rollback")).resolves.toBeUndefined();
    await expect(database.externalLinkImports.get("import-rollback")).resolves.toBeUndefined();
    await expect(database.contentProcessingJobs.get(job.id)).resolves.toMatchObject({
      status: "processing",
      createdFragmentId: null,
    });
  });

  it("ignores stale or cancelled responses", async () => {
    const stale = createLinkProcessingJobRecord({
      id: "job-stale",
      status: "processing",
      attemptGeneration: 2,
      providerTaskId: "provider-task-2",
    });
    const cancelled = createLinkProcessingJobRecord({
      id: "job-cancelled",
      status: "cancelled",
      attemptGeneration: 1,
      providerTaskId: "provider-task-1",
    });
    await database.contentProcessingJobs.bulkAdd([stale, cancelled]);

    const staleResult = await completeLinkProcessingJob(completeInput(stale.id, "stale"), {
      database,
    });
    const cancelledResult = await completeLinkProcessingJob(
      completeInput(cancelled.id, "cancelled"),
      { database },
    );
    expect(staleResult.didFinalize).toBe(false);
    expect(cancelledResult.didFinalize).toBe(false);
    await expect(database.fragments.count()).resolves.toBe(0);
  });

  it("is idempotent after refresh and does not create a second formal record", async () => {
    const job = createLinkProcessingJobRecord({ status: "processing" });
    await database.contentProcessingJobs.add(job);
    const input = completeInput(job.id, "idempotent");
    const first = await completeLinkProcessingJob(input, {
      database,
      createId: ids(["fragment-one", "plant-one", "event-one", "import-one"]),
    });
    const second = await completeLinkProcessingJob(input, { database });

    expect(first.didFinalize).toBe(true);
    expect(second).toMatchObject({
      didFinalize: false,
      didCreateFragment: false,
      fragment: { id: "fragment-one" },
    });
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.externalLinkImports.count()).resolves.toBe(1);
  });

  it("deduplicates against a formal link created while the job was processing", async () => {
    const job = createLinkProcessingJobRecord({
      status: "processing",
      sourceUrl: "https://example.com/race",
      normalizedSourceUrl: "https://example.com/race",
    });
    await database.contentProcessingJobs.add(job);
    const formal = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/race",
        initiatedBy: "form",
        now: PROCESSING_JOB_TEST_NOW,
      },
      { database },
    );
    if (formal.kind !== "created") throw new Error("Expected formal link fixture");
    const previousFragmentCount = await database.fragments.count();

    const result = await completeLinkProcessingJob(completeInput(job.id, "race"), { database });
    expect(result).toMatchObject({
      didFinalize: true,
      didCreateFragment: false,
      fragment: { id: formal.fragment.id },
      job: { status: "completed", createdFragmentId: formal.fragment.id },
    });
    await expect(database.fragments.count()).resolves.toBe(previousFragmentCount);
  });
});

describe("failLinkProcessingJob", () => {
  it("keeps a failed job without creating formal records", async () => {
    const job = createLinkProcessingJobRecord({ status: "processing" });
    await database.contentProcessingJobs.add(job);
    const result = await failLinkProcessingJob(
      {
        jobId: job.id,
        errorCode: "network_error",
        errorMessage: "网络暂不可用",
        requestId: "request-failed",
        attempt: { attemptGeneration: 1, providerTaskId: "provider-task-1" },
        now: FINISHED_AT,
      },
      { database },
    );

    expect(result).toMatchObject({
      didFinalize: true,
      job: { status: "failed", errorCode: "network_error" },
    });
    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.externalLinkImports.count()).resolves.toBe(0);
  });
});
