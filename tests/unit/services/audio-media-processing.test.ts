import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { createMediaFragment } from "../../../services/create-media-fragment";
import {
  applyAudioTranscriptionResult,
  beginAudioTranscription,
  markAudioTranscriptionFailed,
  markStaleAudioProcessing,
  setAudioLocalOnly,
  updateAudioTranscript,
} from "../../../services/audio-media-processing";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-audio-processing-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function createAudioBlob(): Blob {
  return new Blob(["audio-bytes"], { type: "audio/webm;codecs=opus" });
}

async function createAudio() {
  return createMediaFragment(
    {
      blob: createAudioBlob(),
      durationMs: 1_200,
      fileName: "recording.webm",
      kind: "audio",
      mimeType: "audio/webm;codecs=opus",
    },
    { database },
  );
}

describe("audio media processing boundaries", () => {
  it("keeps a recording local without sending it for transcription", async () => {
    const created = await createAudio();

    await setAudioLocalOnly(created.mediaAsset.id, { database });

    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "local_only",
      processingRequestId: null,
    });
    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      analysisStatus: "not_required",
    });
  });

  it("rejects a duplicate request while processing, including the same request id", async () => {
    const created = await createAudio();
    await beginAudioTranscription(created.mediaAsset.id, "request-same", { database });

    await expect(
      beginAudioTranscription(created.mediaAsset.id, "request-same", { database }),
    ).rejects.toThrow("Audio media is already being processed");
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "processing",
      processingRequestId: "request-same",
    });
  });

  it("normalizes an unknown failure code before writing it locally", async () => {
    const created = await createAudio();
    await beginAudioTranscription(created.mediaAsset.id, "request-unknown-code", { database });

    await expect(
      markAudioTranscriptionFailed(
        created.mediaAsset.id,
        "request-unknown-code",
        "internal_provider_detail",
        { database },
      ),
    ).resolves.toBe(true);
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "failed",
      errorCode: "provider_error",
    });
  });

  it("writes provider text, derives a temporary title, and does not add growth", async () => {
    const created = await createAudio();
    await beginAudioTranscription(created.mediaAsset.id, "request-1", { database });

    const result = await applyAudioTranscriptionResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-1",
        transcript: "记录今天要重新整理花园。\n下一句不会成为标题",
      },
      { database },
    );

    expect(result?.asset).toMatchObject({
      processingStatus: "completed",
      originalTranscript: "记录今天要重新整理花园。\n下一句不会成为标题",
      transcript: "记录今天要重新整理花园。\n下一句不会成为标题",
      transcriptEditedAt: null,
    });
    expect(result?.fragment.title).toBe("记录今天要重新整理花园");
    await expect(
      database.fragmentEvents.where("fragmentId").equals(created.fragment.id).count(),
    ).resolves.toBe(1);
    await expect(database.plants.get(created.plant.id)).resolves.toMatchObject({ growthScore: 0 });
  });

  it("preserves edited text unless the user confirms replacement", async () => {
    const created = await createAudio();
    await beginAudioTranscription(created.mediaAsset.id, "request-1", { database });
    await applyAudioTranscriptionResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-1",
        transcript: "第一次转写",
      },
      { database },
    );
    await updateAudioTranscript(
      { assetId: created.mediaAsset.id, transcript: "用户修订后的文字" },
      { database },
    );

    await beginAudioTranscription(created.mediaAsset.id, "request-2", { database });
    await applyAudioTranscriptionResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-2",
        transcript: "新的 provider 结果",
      },
      { database },
    );
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      transcript: "用户修订后的文字",
      originalTranscript: "新的 provider 结果",
    });

    await beginAudioTranscription(created.mediaAsset.id, "request-3", { database });
    await applyAudioTranscriptionResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-3",
        replaceEditedTranscript: true,
        transcript: "确认替换后的文字",
      },
      { database },
    );
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      transcript: "确认替换后的文字",
      originalTranscript: "确认替换后的文字",
      transcriptEditedAt: null,
    });
  });

  it("uses the existing content-update lifecycle boundary for a user transcript edit", async () => {
    const created = await createAudio();
    await database.fragments.update(created.fragment.id, {
      lifecycleStatus: "dormant",
      lastInteractedAt: "2026-07-23T08:00:00.000Z",
    });
    await database.plants.update(created.plant.id, { vitality: "dormant" });

    await updateAudioTranscript(
      { assetId: created.mediaAsset.id, transcript: "用户补充了背景" },
      {
        database,
        createId: () => "restored-from-transcript-edit",
        now: () => new Date("2026-07-24T09:00:00.000Z"),
      },
    );

    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      lifecycleStatus: "active",
      lastInteractedAt: "2026-07-24T09:00:00.000Z",
    });
    await expect(database.plants.get(created.plant.id)).resolves.toMatchObject({
      vitality: "active",
      growthScore: 0,
    });
    await expect(
      database.fragmentEvents.where("fragmentId").equals(created.fragment.id).toArray(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "restored-from-transcript-edit",
          type: "restored",
        }),
      ]),
    );
  });

  it("keeps archived fragments archived when their transcript is edited", async () => {
    const created = await createAudio();
    await database.fragments.update(created.fragment.id, { lifecycleStatus: "archived" });
    await database.plants.update(created.plant.id, { slotId: null });

    await updateAudioTranscript(
      { assetId: created.mediaAsset.id, transcript: "封存内容的补充转写" },
      { database, now: () => new Date("2026-07-24T09:00:00.000Z") },
    );

    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      lifecycleStatus: "archived",
      lastInteractedAt: "2026-07-24T09:00:00.000Z",
    });
    await expect(database.plants.get(created.plant.id)).resolves.toMatchObject({
      slotId: null,
      vitality: "active",
    });
    await expect(
      database.fragmentEvents.where("fragmentId").equals(created.fragment.id).count(),
    ).resolves.toBe(1);
  });

  it("ignores a late response for another request or a deleted fragment", async () => {
    const created = await createAudio();
    await beginAudioTranscription(created.mediaAsset.id, "request-current", { database });

    await expect(
      applyAudioTranscriptionResult(
        { assetId: created.mediaAsset.id, clientRequestId: "request-old", transcript: "旧结果" },
        { database },
      ),
    ).resolves.toBeNull();

    await database.fragments.update(created.fragment.id, { lifecycleStatus: "deleted" });
    await expect(
      markAudioTranscriptionFailed(created.mediaAsset.id, "request-current", "request_timeout", {
        database,
      }),
    ).resolves.toBe(false);
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "processing",
      processingRequestId: "request-current",
    });
  });

  it("marks abandoned processing as failed without deleting the recording", async () => {
    const created = await createAudio();
    const startedAt = new Date("2026-07-24T08:00:00.000Z");
    await beginAudioTranscription(created.mediaAsset.id, "request-stale", {
      database,
      now: () => startedAt,
    });

    const changed = await markStaleAudioProcessing(new Date("2026-07-24T08:30:00.000Z"), database);

    expect(changed).toBe(1);
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "failed",
      processingRequestId: null,
      errorCode: "request_interrupted",
    });
    const persisted = await database.mediaAssets.get(created.mediaAsset.id);
    expect(persisted?.blob.size).toBe(created.mediaAsset.blob.size);
  });
});
