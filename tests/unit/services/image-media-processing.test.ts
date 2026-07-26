import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { createMediaFragment } from "../../../services/create-media-fragment";
import {
  applyImageAnalysisResult,
  beginImageAnalysis,
  markImageAnalysisFailed,
  processImageAnalysis,
} from "../../../services/image-media-processing";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-image-processing-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function createImageBlob(): Blob {
  return new Blob(["image-bytes"], { type: "image/png" });
}

describe("image media processing boundaries", () => {
  it("writes derived Markdown only while the body still matches generated content", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );
    await beginImageAnalysis(created.mediaAsset.id, "request-first", { database });

    const first = await applyImageAnalysisResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-first",
        result: {
          title: "整理后的图片",
          markdown: "图片摘要\n\n可见文字",
        },
      },
      { database },
    );

    expect(first?.fragment).toMatchObject({
      title: "整理后的图片",
      rawText: null,
      contentMarkdown: "图片摘要\n\n可见文字",
      analysisStatus: "completed",
    });
    await database.fragments.update(created.fragment.id, {
      contentMarkdown: "## 用户已经编辑的图片笔记",
    });
    await beginImageAnalysis(created.mediaAsset.id, "request-second", { database });
    await applyImageAnalysisResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-second",
        result: {
          title: "新的分析标题",
          markdown: "新的摘要",
        },
      },
      { database },
    );

    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      title: "整理后的图片",
      contentMarkdown: "## 用户已经编辑的图片笔记",
      analysisStatus: "completed",
    });
    await expect(
      database.fragmentEvents.where("fragmentId").equals(created.fragment.id).count(),
    ).resolves.toBe(1);
  });

  it("preserves a user-authored legacy image note with the new Markdown contract", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
        optionalNote: "User-authored image context",
      },
      { database },
    );
    await beginImageAnalysis(created.mediaAsset.id, "request-user-note", { database });

    await applyImageAnalysisResult(
      {
        assetId: created.mediaAsset.id,
        clientRequestId: "request-user-note",
        result: { title: "Generated title", markdown: "Generated Markdown" },
      },
      { database },
    );

    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      title: "Generated title",
      rawText: "User-authored image context",
      contentMarkdown: "User-authored image context",
      analysisStatus: "completed",
    });
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      generatedTitle: "Generated title",
      summary: null,
      visibleText: null,
      contentKind: null,
    });
  });

  it("does not start a new request for a deleted fragment", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );
    await database.fragments.update(created.fragment.id, { lifecycleStatus: "deleted" });

    await expect(
      beginImageAnalysis(created.mediaAsset.id, "request-deleted", { database }),
    ).rejects.toThrow("Deleted image media cannot be processed");

    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "pending",
      processingRequestId: null,
    });
  });

  it("allows processing for archived fragments while preserving their lifecycle", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );
    await database.fragments.update(created.fragment.id, { lifecycleStatus: "archived" });

    const started = await beginImageAnalysis(created.mediaAsset.id, "request-archived", {
      database,
    });

    expect(started).toMatchObject({
      processingStatus: "processing",
      processingRequestId: "request-archived",
    });
    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      lifecycleStatus: "archived",
    });
  });

  it("rejects a duplicate request while processing, including the same request id", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );
    await beginImageAnalysis(created.mediaAsset.id, "request-same", { database });

    await expect(
      beginImageAnalysis(created.mediaAsset.id, "request-same", { database }),
    ).rejects.toThrow("Image media is already being processed");
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "processing",
      processingRequestId: "request-same",
    });
  });

  it("normalizes an unknown failure code before writing it locally", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );
    await beginImageAnalysis(created.mediaAsset.id, "request-unknown-code", { database });

    await expect(
      markImageAnalysisFailed(
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

  it("ignores a late failure after the fragment is soft-deleted", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );
    await beginImageAnalysis(created.mediaAsset.id, "request-late-failure", { database });
    await database.fragments.update(created.fragment.id, {
      lifecycleStatus: "deleted",
    });

    await expect(
      markImageAnalysisFailed(created.mediaAsset.id, "request-late-failure", "request_timeout", {
        database,
      }),
    ).resolves.toBe(false);

    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "processing",
      processingRequestId: "request-late-failure",
      errorCode: null,
    });
    await expect(database.fragments.get(created.fragment.id)).resolves.toMatchObject({
      lifecycleStatus: "deleted",
      analysisStatus: "pending",
    });
  });

  it("does not report success when the response belongs to another request", async () => {
    const created = await createMediaFragment(
      {
        kind: "image",
        blob: createImageBlob(),
        mimeType: "image/png",
        width: 1,
        height: 1,
      },
      { database },
    );

    const result = await processImageAnalysis(
      created.mediaAsset.id,
      {
        clientRequestId: "request-current",
        fetchImplementation: async () =>
          new Response(
            JSON.stringify({
              requestId: "11111111-1111-4111-8111-111111111111",
              clientRequestId: "request-old",
              analysis: {
                title: "旧结果",
                markdown: "旧摘要",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      },
      database,
    );

    expect(result).toBeNull();
    await expect(database.mediaAssets.get(created.mediaAsset.id)).resolves.toMatchObject({
      processingStatus: "failed",
      processingRequestId: null,
      errorCode: "invalid_model_response",
    });
  });
});
