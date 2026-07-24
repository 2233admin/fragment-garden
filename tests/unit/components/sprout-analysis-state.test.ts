import { describe, expect, it } from "vitest";

import type { ExternalLinkImport, Fragment, Plant } from "../../../domain";
import {
  createSproutAnalysisRequest,
  createSproutSession,
  isSproutSessionReady,
} from "../../../components/fragments/sprout-analysis-state";

const NOW = "2026-07-24T08:00:00.000Z";

function createFragment(changes: Partial<Fragment> = {}): Fragment {
  return {
    id: "fragment-1",
    contentType: "text",
    title: "整理一个周末阅读角",
    rawText: "先明确希望谁来使用，以及第一次开放需要准备什么。",
    sourceUrl: null,
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastInteractedAt: NOW,
    completedAt: null,
    ...changes,
  };
}

function createPlant(changes: Partial<Plant> = {}): Plant {
  return {
    id: "plant-1",
    fragmentId: "fragment-1",
    speciesId: null,
    stage: "growing",
    vitality: "active",
    growthScore: 1,
    slotId: "slot-01",
    createdAt: NOW,
    updatedAt: NOW,
    ...changes,
  };
}

function createLinkImport(changes: Partial<ExternalLinkImport> = {}): ExternalLinkImport {
  return {
    id: "import-1",
    fragmentId: "fragment-1",
    provider: "getnote",
    sourceUrl: "https://example.com/article",
    normalizedUrl: "https://example.com/article",
    canonicalUrl: null,
    sourceContent: null,
    sourceContentTruncated: false,
    status: "completed",
    initiatedBy: "form",
    taskId: null,
    externalNoteId: null,
    providerRequestId: null,
    attemptCount: 1,
    attemptGeneration: 1,
    userProvidedTitle: true,
    userProvidedContent: false,
    errorCode: null,
    errorMessage: null,
    terminalNotificationStatus: "completed",
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    lastPolledAt: NOW,
    completedAt: NOW,
    ...changes,
  };
}

describe("sprout analysis UI boundary", () => {
  it("keeps user-authored link text separate from provider source content", () => {
    const session = createSproutSession({
      additions: [{ source: "user", content: "第一次先邀请六个人。" }],
      externalLinkImport: createLinkImport({
        sourceContent: "这是 GetNote 实际读取到的网页正文。",
        userProvidedContent: true,
      }),
      fragment: createFragment({
        contentType: "link",
        rawText: "这是用户手工补充的背景。",
        sourceUrl: "https://example.com/article",
        summary: "这是 GetNote 返回的摘要。",
      }),
      plant: createPlant(),
    });

    const request = createSproutAnalysisRequest(session, []);

    expect(request.fragment.body).toBe("这是用户手工补充的背景。");
    expect(request.fragment.linkSummary).toBe("这是 GetNote 返回的摘要。");
    expect(request.fragment.linkText).toBe("这是 GetNote 实际读取到的网页正文。");
  });

  it("treats provider text as link content and supports older V3 imports", () => {
    const fragment = createFragment({
      contentType: "link",
      rawText: "旧 V3 记录中保存在 Fragment 的已读取正文。",
      sourceUrl: "https://example.com/article",
      summary: null,
    });
    const oldImport = createLinkImport({ sourceContent: undefined, userProvidedContent: false });
    const session = createSproutSession({
      additions: [],
      externalLinkImport: oldImport,
      fragment,
      plant: createPlant(),
    });

    const request = createSproutAnalysisRequest(session, []);

    expect(request.fragment.body).toBeNull();
    expect(request.fragment.linkText).toBe("旧 V3 记录中保存在 Fragment 的已读取正文。");
    expect(isSproutSessionReady(session)).toBe(true);
  });

  it("keeps obvious link placeholders and deleted fragments local", () => {
    const placeholderSession = createSproutSession({
      additions: [],
      externalLinkImport: createLinkImport(),
      fragment: createFragment({
        contentType: "link",
        title: "链接",
        rawText: null,
        sourceUrl: "https://example.com/article",
        summary: null,
      }),
      plant: createPlant(),
    });
    const deletedSession = createSproutSession({
      additions: [{ source: "user", content: "即使内容足够也不能分析。" }],
      externalLinkImport: null,
      fragment: createFragment({ lifecycleStatus: "deleted" }),
      plant: createPlant({ slotId: null }),
    });

    expect(isSproutSessionReady(placeholderSession)).toBe(false);
    expect(isSproutSessionReady(deletedSession)).toBe(false);
  });

  it("keeps a completed import with only a provider title local", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: createLinkImport({
        sourceContent: null,
        status: "completed",
        userProvidedContent: false,
        userProvidedTitle: false,
      }),
      fragment: createFragment({
        contentType: "link",
        title: "减少无意识刷短视频的三个方法",
        rawText: null,
        sourceUrl: "https://example.com/unreadable-video",
        summary: null,
      }),
      plant: createPlant(),
    });

    expect(isSproutSessionReady(session)).toBe(false);
  });
});
