import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImageMediaPanel } from "../../../components/fragments/ImageMediaPanel";
import { VoiceMediaPanel } from "../../../components/fragments/VoiceMediaPanel";
import type { Fragment, MediaAsset } from "../../../domain";

const TIMESTAMP = "2026-07-26T08:00:00.000Z";

function fragment(contentType: Fragment["contentType"]): Fragment {
  return {
    id: `${contentType}-fragment`,
    contentType,
    title: "保留正文的历史笔记",
    rawText: null,
    sourceUrl: null,
    contentMarkdown: "即使媒体不可读，这段正文仍然存在。",
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "completed",
    embedding: null,
    parentFragmentId: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    lastInteractedAt: TIMESTAMP,
    completedAt: null,
  };
}

function asset(kind: MediaAsset["kind"]): MediaAsset {
  const blob = new Blob(["unreadable"], {
    type: kind === "image" ? "image/png" : "audio/webm",
  });
  return {
    id: `${kind}-asset`,
    fragmentId: `${kind === "image" ? "image" : "audio"}-fragment`,
    kind,
    blob,
    mimeType: blob.type,
    fileName: null,
    sizeBytes: blob.size,
    width: kind === "image" ? 1 : null,
    height: kind === "image" ? 1 : null,
    durationMs: kind === "audio" ? 1_000 : null,
    processingStatus: "completed",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: null,
    generatedTitle: null,
    summary: null,
    visibleText: null,
    contentKind: null,
    transcript: kind === "audio" ? "即使录音不可读，这段转写仍然显示。" : null,
    originalTranscript: kind === "audio" ? "最初转写" : null,
    transcriptEditedAt: kind === "audio" ? TIMESTAMP : null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

describe("media fallback panels", () => {
  it("keeps image details usable when an object URL cannot be created", () => {
    const markup = renderToStaticMarkup(
      createElement(ImageMediaPanel, {
        fragment: fragment("image"),
        mediaAsset: asset("image"),
      }),
    );

    expect(markup).toContain("原图片暂时无法读取");
    expect(markup).toContain("笔记正文和其他内容仍可使用");
  });

  it("keeps an edited transcript visible when historical audio cannot play", () => {
    const markup = renderToStaticMarkup(
      createElement(VoiceMediaPanel, {
        fragment: fragment("audio"),
        mediaAsset: asset("audio"),
      }),
    );

    expect(markup).toContain("原录音暂时无法播放");
    expect(markup).toContain("即使录音不可读，这段转写仍然显示");
    expect(markup).toContain("编辑转写");
    expect(markup).not.toContain("重新转写");
  });
});
