import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLANT_SLOT_IDS, type FragmentEvent, type MediaAsset, type Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { createMediaFragment } from "../../../services/create-media-fragment";

const NOW = new Date("2026-07-24T08:30:00.000Z");
const TIMESTAMP = NOW.toISOString();
let database: FragmentGardenDatabase;

function createIdSequence(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    index += 1;
    if (id === undefined) {
      throw new Error("Test ID sequence exhausted");
    }
    return id;
  };
}

function createImageBlob(): Blob {
  return new Blob(["valid-enough-test-image"], { type: "image/png" });
}

function createAudioBlob(): Blob {
  return new Blob(["valid-enough-test-audio"], { type: "audio/webm;codecs=opus" });
}

function createMediaAsset(id: string, fragmentId: string): MediaAsset {
  return {
    id,
    fragmentId,
    kind: "image",
    blob: createImageBlob(),
    mimeType: "image/png",
    fileName: null,
    sizeBytes: createImageBlob().size,
    width: 1,
    height: 1,
    durationMs: null,
    processingStatus: "pending",
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
  };
}

function createOccupiedPlant(slotId: string, index: number): Plant {
  return {
    id: `occupied-plant-${index}`,
    fragmentId: `occupied-fragment-${index}`,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-create-media-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("createMediaFragment", () => {
  it("atomically creates an image fragment, plant, media asset, and created event", async () => {
    const result = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        fileName: "  idea.png ",
        width: 640,
        height: 480,
        optionalTitle: "  我的截图  ",
        optionalNote: "补充说明",
      },
      {
        database,
        createId: createIdSequence(["fragment-1", "plant-1", "asset-1", "event-1"]),
        now: () => NOW,
      },
    );

    expect(result.fragment).toMatchObject({
      id: "fragment-1",
      contentType: "image",
      title: "我的截图",
      rawText: "补充说明",
      analysisStatus: "pending",
    });
    expect(result.plant).toMatchObject({
      id: "plant-1",
      fragmentId: "fragment-1",
      stage: "seedling",
      slotId: "slot-01",
    });
    expect(result.mediaAsset).toMatchObject({
      id: "asset-1",
      fragmentId: "fragment-1",
      kind: "image",
      mimeType: "image/png",
      fileName: "idea.png",
      sizeBytes: result.mediaAsset.blob.size,
      width: 640,
      height: 480,
      processingStatus: "pending",
      temporaryTitle: null,
      contentKind: null,
    });
    expect(result.createdEvent).toMatchObject({
      id: "event-1",
      fragmentId: "fragment-1",
      type: "created",
      payload: null,
    });
    await expect(database.mediaAssets.count()).resolves.toBe(1);
    await expect(
      database.fragmentEvents.where("fragmentId").equals("fragment-1").count(),
    ).resolves.toBe(1);
  });

  it("uses a temporary title marker and still creates without a free plant slot", async () => {
    await database.plants.bulkAdd(
      PLANT_SLOT_IDS.map((slotId, index) => createOccupiedPlant(slotId, index)),
    );

    const result = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 2,
        height: 2,
      },
      {
        database,
        createId: createIdSequence([
          "fragment-no-slot",
          "plant-no-slot",
          "asset-no-slot",
          "event-no-slot",
        ]),
        now: () => NOW,
      },
    );

    expect(result.fragment.title).toMatch(/^图片想法 · /u);
    expect(result.mediaAsset.temporaryTitle).toBe(result.fragment.title);
    expect(result.plant.slotId).toBeNull();
  });

  it("atomically creates an audio fragment and canonicalizes its MIME type", async () => {
    const result = await createMediaFragment(
      {
        blob: createAudioBlob(),
        durationMs: 2_500,
        fileName: "thought.webm",
        kind: "audio",
        mimeType: "audio/webm;codecs=opus",
      },
      {
        database,
        createId: createIdSequence(["audio-fragment", "audio-plant", "audio-asset", "audio-event"]),
        now: () => NOW,
      },
    );

    expect(result.fragment.contentType).toBe("audio");
    expect(result.mediaAsset).toMatchObject({
      kind: "audio",
      mimeType: "audio/webm",
      durationMs: 2_500,
      processingStatus: "pending",
      transcript: null,
    });
    expect(result.plant.slotId).toBe("slot-01");
    await expect(
      database.fragmentEvents.where("fragmentId").equals("audio-fragment").count(),
    ).resolves.toBe(1);
  });

  it.each([
    ["unsupported MIME", "audio/flac", 1, 1],
    ["too large", "audio/webm", 15 * 1024 * 1024 + 1, 1],
    ["too long", "audio/webm", 1, 3 * 60 * 1000 + 1],
  ] as const)(
    "rejects invalid audio input (%s) before creating records",
    async (_label, mimeType, sizeBytes, durationMs) => {
      const blob = new Blob([new Uint8Array(sizeBytes)], { type: mimeType });
      await expect(
        createMediaFragment({ kind: "audio", blob, durationMs, mimeType }),
      ).rejects.toBeDefined();
      await expect(database.fragments.count()).resolves.toBe(0);
      await expect(database.mediaAssets.count()).resolves.toBe(0);
    },
  );

  it("rolls back all media records when the media write collides", async () => {
    const existingAsset = createMediaAsset("asset-collision", "existing-fragment");
    await database.mediaAssets.add(existingAsset);

    await expect(
      createMediaFragment(
        {
          kind: "image",
          blob: createImageBlob(),
          mimeType: "image/png",
          width: 1,
          height: 1,
        },
        {
          database,
          createId: createIdSequence([
            "rollback-fragment",
            "rollback-plant",
            existingAsset.id,
            "rollback-event",
          ]),
          now: () => NOW,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get("rollback-fragment")).resolves.toBeUndefined();
    await expect(database.plants.get("rollback-plant")).resolves.toBeUndefined();
    await expect(database.mediaAssets.toArray()).resolves.toEqual([existingAsset]);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("rolls back the media asset when the final created event write collides", async () => {
    const existingEvent: FragmentEvent = {
      id: "event-collision",
      fragmentId: "existing-fragment",
      type: "created",
      payload: null,
      occurredAt: TIMESTAMP,
      ruleVersion: 1,
    };
    await database.fragmentEvents.add(existingEvent);

    await expect(
      createMediaFragment(
        {
          kind: "image",
          blob: createImageBlob(),
          mimeType: "image/png",
          width: 1,
          height: 1,
        },
        {
          database,
          createId: createIdSequence([
            "rollback-fragment",
            "rollback-plant",
            "rollback-asset",
            existingEvent.id,
          ]),
          now: () => NOW,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get("rollback-fragment")).resolves.toBeUndefined();
    await expect(database.plants.get("rollback-plant")).resolves.toBeUndefined();
    await expect(database.mediaAssets.get("rollback-asset")).resolves.toBeUndefined();
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
  });
});
