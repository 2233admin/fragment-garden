import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLANT_SLOT_IDS, type MediaAsset, type Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import {
  beginImageProcessingJob,
  cancelImageProcessingJob,
  createImageProcessingJob,
  failImageProcessingJob,
  finalizeImageProcessingJob,
  markStaleImageProcessingJobs,
  processImageProcessingJob,
  retryImageProcessingJob,
} from "../../../services/image-processing-jobs";
import { dismissCompletedContentProcessingJob } from "../../../services/content-processing-job-lifecycle";

const CREATED_AT = "2026-07-25T08:00:00.000Z";
const FINISHED_AT = "2026-07-25T08:05:00.000Z";
let database: FragmentGardenDatabase;

function idSequence(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index++];
    if (id === undefined) throw new Error("Test ID sequence exhausted");
    return id;
  };
}

function createPngBlob(): Blob {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, 2);
  new DataView(bytes.buffer).setUint32(20, 3);
  return new Blob([bytes], { type: "image/png" });
}

function completedApiResponse(clientRequestId: string): Response {
  return new Response(
    JSON.stringify({
      requestId: "11111111-1111-4111-8111-111111111111",
      clientRequestId,
      analysis: { title: "Generated title", markdown: "## Observation\n\nA small diagram." },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function occupiedPlant(slotId: string, index: number): Plant {
  return {
    id: `occupied-plant-${index}`,
    fragmentId: `occupied-fragment-${index}`,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function existingAsset(id: string): MediaAsset {
  const blob = createPngBlob();
  return {
    id,
    fragmentId: "existing-fragment",
    kind: "image",
    blob,
    mimeType: "image/png",
    fileName: null,
    sizeBytes: blob.size,
    width: 2,
    height: 3,
    durationMs: null,
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
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

async function createJob(jobId = "image-job") {
  return createImageProcessingJob(
    {
      blob: createPngBlob(),
      mimeType: "image/png",
      fileName: " idea.png ",
      width: 2,
      height: 3,
      userTitle: " User title ",
      userNoteMarkdown: " My note ",
      initiator: "form",
    },
    { database, createId: () => jobId, now: () => new Date(CREATED_AT) },
  );
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-image-jobs-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

describe("image processing jobs", () => {
  it("stores only validated temporary image data before provider processing", async () => {
    const job = await createJob();

    expect(job).toMatchObject({
      id: "image-job",
      kind: "image",
      status: "pending",
      sourceMimeType: "image/png",
      sourceFileName: "idea.png",
      sourceWidth: 2,
      sourceHeight: 3,
      userTitle: "User title",
      userNoteMarkdown: "My note",
      sourceUrl: null,
      sourceFragmentId: null,
      createdFragmentId: null,
    });
    expect(job.sourceBlob).toBeInstanceOf(Blob);
    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.mediaAssets.count()).resolves.toBe(0);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("binds completion to the active request and atomically creates formal records once", async () => {
    await createJob();
    await beginImageProcessingJob("image-job", "request-current", {
      database,
      now: () => new Date(CREATED_AT),
    });

    await expect(
      finalizeImageProcessingJob(
        {
          jobId: "image-job",
          clientRequestId: "request-old",
          result: { title: "Old", markdown: "Old result" },
        },
        { database },
      ),
    ).resolves.toBeNull();

    const result = await finalizeImageProcessingJob(
      {
        jobId: "image-job",
        clientRequestId: "request-current",
        result: { title: "Generated title", markdown: "## Generated\n\nBody" },
      },
      {
        database,
        createId: idSequence(["fragment-1", "plant-1", "asset-1", "event-1"]),
        now: () => new Date(FINISHED_AT),
      },
    );

    expect(result?.fragment).toMatchObject({
      id: "fragment-1",
      title: "User title",
      contentMarkdown: "My note\n\n## Generated\n\nBody",
      contentType: "image",
      analysisStatus: "completed",
    });
    expect(result?.plant).toMatchObject({ fragmentId: "fragment-1", slotId: "slot-01" });
    expect(result?.mediaAsset).toMatchObject({
      id: "asset-1",
      fragmentId: "fragment-1",
      processingStatus: "completed",
      generatedTitle: "Generated title",
      summary: null,
      visibleText: null,
      contentKind: null,
    });
    expect(result?.job).toMatchObject({
      status: "completed",
      createdFragmentId: "fragment-1",
      sourceBlob: null,
      resultTitle: "Generated title",
      resultMarkdown: "## Generated\n\nBody",
    });
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.mediaAssets.count()).resolves.toBe(1);
    await expect(database.fragmentEvents.count()).resolves.toBe(1);

    await expect(
      finalizeImageProcessingJob(
        {
          jobId: "image-job",
          clientRequestId: "request-current",
          result: { title: "Duplicate", markdown: "Duplicate" },
        },
        { database },
      ),
    ).resolves.toBeNull();
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.mediaAssets.count()).resolves.toBe(1);
  });

  it("still creates a formal image note when all plant slots are occupied", async () => {
    await database.plants.bulkAdd(
      PLANT_SLOT_IDS.map((slotId, index) => occupiedPlant(slotId, index)),
    );
    await createJob();
    await beginImageProcessingJob("image-job", "request-full", { database });

    const result = await finalizeImageProcessingJob(
      {
        jobId: "image-job",
        clientRequestId: "request-full",
        result: { title: "Generated", markdown: "Generated body" },
      },
      {
        database,
        createId: idSequence(["fragment-full", "plant-full", "asset-full", "event-full"]),
      },
    );

    expect(result?.plant.slotId).toBeNull();
    await expect(database.fragments.get("fragment-full")).resolves.toBeDefined();
    await expect(database.mediaAssets.get("asset-full")).resolves.toBeDefined();
  });

  it("keeps the Blob on failure and retries with a fresh request identity", async () => {
    await createJob();
    await beginImageProcessingJob("image-job", "request-first", { database });
    await expect(
      failImageProcessingJob("image-job", "request-first", "request_timeout", { database }),
    ).resolves.toBe(true);
    await expect(database.contentProcessingJobs.get("image-job")).resolves.toMatchObject({
      status: "failed",
      processingRequestId: null,
      errorCode: "request_timeout",
      sourceBlob: expect.any(Blob),
    });

    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const formData = init?.body as FormData;
      expect(formData.get("clientRequestId")).toBe("request-second");
      return completedApiResponse("request-second");
    });
    const result = await retryImageProcessingJob(
      "image-job",
      { clientRequestId: "request-second", fetchImplementation },
      database,
    );

    expect(result?.job.status).toBe("completed");
    expect(result?.job.attemptCount).toBe(2);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    await expect(database.mediaAssets.count()).resolves.toBe(1);
  });

  it("cancels temporary data and ignores a response that arrives later", async () => {
    await createJob();
    await beginImageProcessingJob("image-job", "request-cancelled", { database });

    await expect(cancelImageProcessingJob("image-job", { database })).resolves.toBe(true);
    await expect(database.contentProcessingJobs.get("image-job")).resolves.toBeUndefined();
    await expect(
      finalizeImageProcessingJob(
        {
          jobId: "image-job",
          clientRequestId: "request-cancelled",
          result: { title: "Late", markdown: "Late result" },
        },
        { database },
      ),
    ).resolves.toBeNull();
    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.mediaAssets.count()).resolves.toBe(0);
  });

  it("marks interrupted processing as retryable without calling a provider", async () => {
    await createJob();
    await beginImageProcessingJob("image-job", "request-stale", {
      database,
      now: () => new Date(CREATED_AT),
    });

    await expect(
      markStaleImageProcessingJobs(new Date("2026-07-25T08:01:00.000Z"), database),
    ).resolves.toBe(1);
    await expect(database.contentProcessingJobs.get("image-job")).resolves.toMatchObject({
      status: "failed",
      processingRequestId: null,
      errorCode: "request_interrupted",
      sourceBlob: expect.any(Blob),
    });
    await expect(database.fragments.count()).resolves.toBe(0);
  });

  it("keeps a pending image available for explicit continuation without provider recovery", async () => {
    await createJob("pending-before-callback");

    await expect(
      markStaleImageProcessingJobs(new Date("2026-07-25T08:01:00.000Z"), database),
    ).resolves.toBe(0);
    await expect(
      database.contentProcessingJobs.get("pending-before-callback"),
    ).resolves.toMatchObject({
      status: "pending",
      processingRequestId: null,
      errorCode: null,
      sourceBlob: expect.any(Blob),
    });
    await expect(database.fragments.count()).resolves.toBe(0);
  });

  it("does not interrupt a provider request while another worker holds the image job lock", async () => {
    await createJob("locked-image-job");
    let resolveFetch: (response: Response) => void = () => undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchImplementation = vi.fn(() => responsePromise);

    const processing = processImageProcessingJob(
      "locked-image-job",
      { clientRequestId: "locked-request", fetchImplementation },
      database,
    );
    await vi.waitFor(async () => {
      await expect(database.contentProcessingJobs.get("locked-image-job")).resolves.toMatchObject({
        status: "processing",
        processingRequestId: "locked-request",
      });
    });

    await expect(
      markStaleImageProcessingJobs(new Date("2026-07-25T09:00:00.000Z"), database),
    ).resolves.toBe(0);
    await expect(database.contentProcessingJobs.get("locked-image-job")).resolves.toMatchObject({
      status: "processing",
      processingRequestId: "locked-request",
    });

    resolveFetch(completedApiResponse("locked-request"));
    await expect(processing).resolves.toMatchObject({
      job: { status: "completed" },
      fragment: { id: expect.any(String) },
    });
  });

  it("dismisses a viewed completed job without deleting its formal note or media", async () => {
    await createJob("completed-image-job");
    await beginImageProcessingJob("completed-image-job", "completed-request", { database });
    const finalized = await finalizeImageProcessingJob(
      {
        jobId: "completed-image-job",
        clientRequestId: "completed-request",
        result: { title: "Completed", markdown: "Completed body" },
      },
      {
        database,
        createId: idSequence([
          "completed-fragment",
          "completed-plant",
          "completed-asset",
          "completed-event",
        ]),
      },
    );
    expect(finalized).not.toBeNull();

    await expect(
      dismissCompletedContentProcessingJob("completed-image-job", { database }),
    ).resolves.toBe(true);
    await expect(
      database.contentProcessingJobs.get("completed-image-job"),
    ).resolves.toBeUndefined();
    await expect(database.fragments.get("completed-fragment")).resolves.toBeDefined();
    await expect(database.plants.get("completed-plant")).resolves.toBeDefined();
    await expect(database.mediaAssets.get("completed-asset")).resolves.toBeDefined();
    await expect(database.fragmentEvents.get("completed-event")).resolves.toBeDefined();
  });

  it("rolls back all formal writes and preserves the processing job when finalization fails", async () => {
    const collision = existingAsset("asset-collision");
    await database.mediaAssets.add(collision);
    await createJob();
    await beginImageProcessingJob("image-job", "request-rollback", { database });

    await expect(
      finalizeImageProcessingJob(
        {
          jobId: "image-job",
          clientRequestId: "request-rollback",
          result: { title: "Generated", markdown: "Generated body" },
        },
        {
          database,
          createId: idSequence([
            "fragment-rollback",
            "plant-rollback",
            collision.id,
            "event-rollback",
          ]),
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get("fragment-rollback")).resolves.toBeUndefined();
    await expect(database.plants.get("plant-rollback")).resolves.toBeUndefined();
    await expect(database.fragmentEvents.get("event-rollback")).resolves.toBeUndefined();
    await expect(database.mediaAssets.toArray()).resolves.toEqual([collision]);
    await expect(database.contentProcessingJobs.get("image-job")).resolves.toMatchObject({
      status: "processing",
      processingRequestId: "request-rollback",
      sourceBlob: expect.any(Blob),
      createdFragmentId: null,
    });
  });
});
