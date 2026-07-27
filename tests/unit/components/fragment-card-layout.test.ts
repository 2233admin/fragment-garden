import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FragmentList } from "../../../components/fragments/FragmentList";
import type { FragmentCardViewModel } from "../../../data/queries/fragment-card-query";

const TIMESTAMP = "2026-07-27T02:00:00.000Z";

function createCard(contentType: FragmentCardViewModel["contentType"]): FragmentCardViewModel {
  const isLink = contentType === "link";
  const isImage = contentType === "image";

  return {
    id: `${contentType}-card`,
    plantId: `${contentType}-plant`,
    contentType,
    title: `${contentType} card with a deliberately long title for two-line truncation`,
    contentMarkdown: "正文内容",
    rawText: "正文内容",
    excerpt: "用于验证列表卡片统一高度和摘要截断的正文内容。".repeat(8),
    searchText: "正文内容",
    sourceUrl: isLink ? "https://example.com/note" : null,
    sourceHostname: isLink ? "example.com" : null,
    analysisStatus: isImage || isLink ? "completed" : "not_required",
    linkImportStatus: isLink ? "completed" : null,
    linkImportErrorMessage: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    lastInteractedAt: TIMESTAMP,
    lifecycleStatus: "active",
    completionStatus: "open",
    plantStage: "seedling",
    growthScore: 0,
    isPlacedInGarden: true,
    mediaKind: isImage ? "image" : null,
    mediaProcessingStatus: isImage ? "completed" : null,
    mediaSizeBytes: isImage ? 68 : null,
    mediaDurationMs: null,
    mediaBlob: null,
  };
}

describe("fragment card layout", () => {
  it("uses one fixed card frame for text, link, and image notes", () => {
    const markup = renderToStaticMarkup(
      createElement(FragmentList, {
        fragments: [createCard("text"), createCard("link"), createCard("image")],
        openingFragmentId: null,
        onOpen: vi.fn(),
      }),
    );
    const cardClassNames = [...markup.matchAll(/<button[^>]*class="([^"]+)"/gu)].map(
      (match) => match[1],
    );

    expect(cardClassNames).toHaveLength(3);
    expect(new Set(cardClassNames).size).toBe(1);
    expect(cardClassNames[0]).toContain("h-[21rem]");
    expect(cardClassNames[0]).toContain("overflow-hidden");
    expect(markup.match(/line-clamp-2/gu)).toHaveLength(3);
    expect(markup.match(/line-clamp-3/gu)).toHaveLength(3);
    expect(markup.match(/mt-auto/gu)).toHaveLength(3);
    expect(markup).toContain("h-28 w-full shrink-0");
  });
});
