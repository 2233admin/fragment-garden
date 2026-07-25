import { describe, expect, it } from "vitest";

import type { ExternalLinkImport, Fragment, MediaAsset, Plant } from "../../../domain";
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

function createImageAsset(changes: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-1",
    fragmentId: "fragment-1",
    kind: "image",
    blob: new Blob(["private image bytes"], { type: "image/png" }),
    mimeType: "image/png",
    fileName: "garden.png",
    sizeBytes: 19,
    width: 2,
    height: 2,
    durationMs: null,
    processingStatus: "pending",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: "鍥剧墖鎯虫硶 路 2026/07/24 08:00",
    generatedTitle: null,
    summary: null,
    visibleText: null,
    contentKind: null,
    transcript: null,
    originalTranscript: null,
    transcriptEditedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...changes,
  };
}

function createAudioAsset(changes: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-audio-1",
    fragmentId: "fragment-1",
    kind: "audio",
    blob: new Blob(["private audio bytes"], { type: "audio/webm" }),
    mimeType: "audio/webm",
    fileName: "garden.webm",
    sizeBytes: 18,
    width: null,
    height: null,
    durationMs: 1_200,
    processingStatus: "pending",
    processingRequestId: null,
    errorCode: null,
    temporaryTitle: "语音想法 · 2026/07/24 08:00",
    generatedTitle: null,
    summary: null,
    visibleText: null,
    contentKind: null,
    transcript: null,
    originalTranscript: null,
    transcriptEditedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
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

  it("treats an unanalyzed image with no user note as insufficient", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "image",
        title: "我的旅行计划截图",
        rawText: null,
      }),
      plant: createPlant(),
      mediaAsset: createImageAsset(),
    });

    expect(isSproutSessionReady(session)).toBe(false);
  });

  it("sends analyzed image text fields without the original Blob", () => {
    const generatedTitle = "图片中的社区活动";
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "image",
        title: "鍥剧墖鎯虫硶 路 2026/07/24 08:00",
        rawText: null,
      }),
      plant: createPlant(),
      mediaAsset: createImageAsset({
        processingStatus: "completed",
        generatedTitle,
        summary: "涓€寮犲寘鍚畝鐭爣棰樼殑鎴浘",
        visibleText: "绀惧尯娲诲姩",
        contentKind: "screenshot",
      }),
    });

    expect(isSproutSessionReady(session)).toBe(true);
    const request = createSproutAnalysisRequest(session, []);
    expect(request.fragment.mediaSummary).toBe("涓€寮犲寘鍚畝鐭爣棰樼殑鎴浘");
    expect(request.fragment.mediaVisibleText).toBe("绀惧尯娲诲姩");
    expect(request.fragment.mediaContentKind).toBe("screenshot");
    expect(request.fragment.title).toBe(generatedTitle);
    expect(request).not.toHaveProperty("blob");
    expect(JSON.stringify(request)).not.toContain("private image bytes");
  });

  it("allows an image with a user note before image analysis", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "image",
        title: "鍥剧墖鎯虫硶 路 2026/07/24 08:00",
        rawText: "鎴戞兂璁颁綇杩欏紶鍥剧墖涓庡懆鏈瑙夊竷缃殑鍏崇郴",
      }),
      plant: createPlant(),
      mediaAsset: createImageAsset(),
    });

    expect(isSproutSessionReady(session)).toBe(true);
    expect(createSproutAnalysisRequest(session, []).fragment.body).toContain("瑙夊竷缃殑鍏崇郴");
  });

  it("does not treat a custom image title alone as meaningful content", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "image",
        title: "我的灵感截图",
        rawText: null,
      }),
      plant: createPlant(),
      mediaAsset: createImageAsset({ temporaryTitle: null }),
    });

    expect(isSproutSessionReady(session)).toBe(false);
  });

  it("uses an analyzed audio transcript without sending the original Blob", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "audio",
        title: "语音记录",
        rawText: null,
      }),
      plant: createPlant(),
      mediaAsset: createAudioAsset({
        processingStatus: "completed",
        transcript: "把周末阅读角先整理出一个可以试用的小区域。",
        originalTranscript: "把周末阅读角先整理出一个可以试用的小区域。",
      }),
    });

    expect(isSproutSessionReady(session)).toBe(true);
    const request = createSproutAnalysisRequest(session, []);
    expect(request.fragment.mediaTranscript).toContain("阅读角");
    expect(request.fragment.title).toBe("语音记录");
    expect(request).not.toHaveProperty("blob");
    expect(JSON.stringify(request)).not.toContain("private audio bytes");
  });

  it("allows an audio user note before transcription", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "audio",
        title: "语音记录",
        rawText: "我想记住这段录音和下周计划之间的关系。",
      }),
      plant: createPlant(),
      mediaAsset: createAudioAsset(),
    });

    expect(isSproutSessionReady(session)).toBe(true);
    expect(createSproutAnalysisRequest(session, []).fragment.body).toContain("下周计划");
  });

  it("treats an audio Blob with no transcript or note as insufficient", () => {
    const session = createSproutSession({
      additions: [],
      externalLinkImport: null,
      fragment: createFragment({
        contentType: "audio",
        title: "语音记录",
        rawText: null,
      }),
      plant: createPlant(),
      mediaAsset: createAudioAsset(),
    });

    expect(isSproutSessionReady(session)).toBe(false);
  });
});
