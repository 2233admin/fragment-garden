import { describe, expect, it } from "vitest";

import {
  markdownToPlainText,
  plainTextToMarkdown,
  resolveFragmentContentMarkdown,
  type ExternalLinkImport,
  type Fragment,
  type MediaAsset,
} from "../../../domain";

function fragment(overrides: Partial<Fragment> = {}): Fragment {
  return {
    id: "fragment-1",
    contentType: "text",
    title: "标题",
    rawText: "普通正文",
    sourceUrl: null,
    contentMarkdown: "",
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
    lastInteractedAt: "2026-07-23T08:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-1",
    fragmentId: "fragment-1",
    kind: "image",
    blob: new Blob(["media"], { type: "image/png" }),
    mimeType: "image/png",
    fileName: "idea.png",
    sizeBytes: 5,
    width: 10,
    height: 10,
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
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
    ...overrides,
  };
}

it("escapes Markdown-looking legacy text while preserving readable text", () => {
  const input = "# 不是标题\n- 不是列表\n保留 *星号* 和 [括号]";
  const markdown = plainTextToMarkdown(input);

  expect(markdown).toBe("\\# 不是标题  \n\\- 不是列表  \n保留 \\*星号\\* 和 \\[括号\\]");
  expect(markdownToPlainText(markdown)).toBe(input);
});

describe("resolveFragmentContentMarkdown", () => {
  it("preserves an existing normalized Markdown body", () => {
    expect(
      resolveFragmentContentMarkdown(
        fragment({ contentMarkdown: "\r\n## 已编辑\r\n\r\n正文\r\n" }),
      ),
    ).toBe("## 已编辑\n\n正文");
  });

  it("uses retained link source content before summary or URL fallback", () => {
    const linkFragment = fragment({
      contentType: "link",
      rawText: null,
      sourceUrl: "https://example.com/article",
      summary: "摘要",
    });
    const linkImport = {
      fragmentId: linkFragment.id,
      sourceContent: "读取后的正文",
    } as ExternalLinkImport;

    expect(resolveFragmentContentMarkdown(linkFragment, linkImport)).toBe("读取后的正文\n\n摘要");
  });

  it("combines an image note with derived summary and visible text", () => {
    const imageFragment = fragment({ contentType: "image", rawText: "用户说明" });
    const image = mediaAsset({ summary: "一张流程图", visibleText: "开始 -> 完成" });

    expect(resolveFragmentContentMarkdown(imageFragment, null, image)).toBe(
      "一张流程图\n\n开始 -\\> 完成\n\n用户说明",
    );
  });

  it("uses the edited transcript for historical audio content", () => {
    const audioFragment = fragment({ contentType: "audio", rawText: null });
    const audio = mediaAsset({
      kind: "audio",
      mimeType: "audio/webm",
      transcript: "当前转写",
      width: null,
      height: null,
    });

    expect(resolveFragmentContentMarkdown(audioFragment, null, audio)).toBe("当前转写");
  });

  it("returns a deterministic non-empty fallback without mutating input", () => {
    const imageFragment = fragment({ contentType: "image", rawText: null });
    const snapshot = structuredClone(imageFragment);

    expect(resolveFragmentContentMarkdown(imageFragment)).toBe("这张图片暂时没有可用的整理笔记。");
    expect(imageFragment).toEqual(snapshot);
  });
});
