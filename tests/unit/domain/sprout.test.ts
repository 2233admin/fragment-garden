import { describe, expect, it } from "vitest";

import {
  buildSproutContext,
  createLocalDateKey,
  evaluateSproutContentReadiness,
  isLocalDateKey,
  isSproutRecommendedActionAllowed,
} from "../../../domain";
import { SPROUT_MAX_TOTAL_CHARACTERS } from "../../../validation/sprout-api";

const BASE_FRAGMENT = {
  title: "一个想法",
  body: "想做一个帮助人少刷短视频的工具。",
  additions: [],
  linkSummary: null,
  linkText: null,
  lifecycleStatus: "active" as const,
  isCompleted: false,
  isArchived: false,
  growthStage: "growing" as const,
};

describe("evaluateSproutContentReadiness", () => {
  it("rejects empty, URL-only, placeholder, and generic platform content", () => {
    expect(
      evaluateSproutContentReadiness({
        title: "未命名碎片",
        body: null,
        additions: [],
        linkSummary: null,
        linkText: null,
        sourceUrl: null,
      }),
    ).toEqual({ isReady: false, reason: "no_meaningful_content" });

    expect(
      evaluateSproutContentReadiness({
        title: "来自 www.xiaohongshu.com 的链接",
        body: "https://www.xiaohongshu.com/example?!",
        additions: [],
        linkSummary: null,
        linkText: "小红书",
        sourceUrl: "https://www.xiaohongshu.com/example",
      }),
    ).toEqual({ isReady: false, reason: "unreadable_link" });
  });

  it("keeps short but explicit ideas and accepts useful additions or link summaries", () => {
    expect(
      evaluateSproutContentReadiness({
        title: "做一个离线读书清单",
        body: null,
        additions: [],
        linkSummary: null,
        linkText: null,
        sourceUrl: null,
      }),
    ).toEqual({ isReady: true });

    expect(
      evaluateSproutContentReadiness({
        title: "链接碎片",
        body: null,
        additions: [{ source: "user", content: "我在意它如何减少晚上的分心。" }],
        linkSummary: null,
        linkText: null,
        sourceUrl: "https://example.com",
      }),
    ).toEqual({ isReady: true });

    expect(
      evaluateSproutContentReadiness({
        title: "抖音",
        body: null,
        additions: [],
        linkSummary: "文章比较了三种不依赖提醒的专注方法。",
        linkText: null,
        sourceUrl: "https://example.com",
      }),
    ).toEqual({ isReady: true });
  });

  it("rejects a link with a provider-specific title but no readable content", () => {
    expect(
      evaluateSproutContentReadiness({
        title: "减少无意识刷短视频的三个方法",
        body: null,
        additions: [],
        linkSummary: null,
        linkText: null,
        sourceUrl: "https://example.com/unreadable-video",
      }),
    ).toEqual({ isReady: false, reason: "unreadable_link" });
  });

  it("does not mutate its input", () => {
    const input = {
      title: "一个清楚的想法",
      body: "保留原始内容",
      additions: [{ source: "user" as const, content: "补充" }],
      linkSummary: null,
      linkText: null,
      sourceUrl: null,
    };
    const snapshot = structuredClone(input);

    evaluateSproutContentReadiness(input);

    expect(input).toEqual(snapshot);
  });
});

describe("buildSproutContext", () => {
  it("applies field, addition, avoidance, and total character limits deterministically", () => {
    const input = {
      fragment: {
        ...BASE_FRAGMENT,
        title: "题".repeat(400),
        body: "正".repeat(8_000),
        additions: Array.from({ length: 14 }, (_, index) => ({
          source: index % 3 === 0 ? ("partner" as const) : ("user" as const),
          content: `${index}:`.padEnd(1_800, "补"),
        })),
        linkSummary: "摘".repeat(3_000),
        linkText: "链".repeat(10_000),
      },
      avoidDirections: ["旧一", "旧二", "旧三", "旧四"],
    };
    const snapshot = structuredClone(input);
    const result = buildSproutContext(input);
    const allText = [
      result.fragment.title,
      result.fragment.body ?? "",
      ...result.fragment.additions.map((addition) => addition.content),
      result.fragment.linkSummary ?? "",
      result.fragment.linkText ?? "",
      ...result.avoidDirections,
    ].join("");

    expect(Array.from(result.fragment.title)).toHaveLength(300);
    expect(Array.from(result.fragment.body ?? "")).toHaveLength(6_000);
    expect(result.fragment.additions.length).toBeLessThanOrEqual(10);
    expect(
      result.fragment.additions.every((addition) => Array.from(addition.content).length <= 1_500),
    ).toBe(true);
    expect(result.avoidDirections).toEqual(["旧二", "旧三", "旧四"]);
    expect(Array.from(allText).length).toBeLessThanOrEqual(SPROUT_MAX_TOTAL_CHARACTERS);
    expect(input).toEqual(snapshot);
    expect(JSON.stringify(result)).not.toContain("taskId");
    expect(JSON.stringify(result)).not.toContain("externalNoteId");
  });

  it("prioritizes the newest user additions before saved partner suggestions", () => {
    const result = buildSproutContext({
      fragment: {
        ...BASE_FRAGMENT,
        body: "正".repeat(6_000),
        additions: [
          { source: "partner", content: "旧伙伴建议".repeat(300) },
          { source: "user", content: "旧用户补充".repeat(300) },
          { source: "user", content: "最新用户补充".repeat(300) },
        ],
        linkSummary: "摘要".repeat(1_000),
        linkText: "链接正文".repeat(3_000),
      },
      avoidDirections: [],
    });

    expect(
      result.fragment.additions.some((addition) => addition.content.includes("最新用户补充")),
    ).toBe(true);
  });
});

describe("local sprout date keys", () => {
  it("uses the browser offset across local midnight", () => {
    const instant = new Date("2026-07-24T16:30:00.000Z");

    expect(createLocalDateKey(instant, -480)).toBe("2026-07-25");
    expect(createLocalDateKey(instant, 420)).toBe("2026-07-24");
    expect(createLocalDateKey(new Date("2026-07-25T00:30:00.000Z"), 420)).toBe("2026-07-24");
  });

  it("validates real calendar dates", () => {
    expect(isLocalDateKey("2028-02-29")).toBe(true);
    expect(isLocalDateKey("2027-02-29")).toBe(false);
    expect(isLocalDateKey("2026-7-24")).toBe(false);
  });
});

describe("sprout recommended action compatibility", () => {
  it("rejects actions for deleted fragments and completion for completed fragments", () => {
    expect(
      isSproutRecommendedActionAllowed("add_content", {
        lifecycleStatus: "deleted",
        completionStatus: "open",
      }),
    ).toBe(false);
    expect(
      isSproutRecommendedActionAllowed("mark_completed", {
        lifecycleStatus: "active",
        completionStatus: "completed",
      }),
    ).toBe(false);
    expect(
      isSproutRecommendedActionAllowed("grow_new_idea", {
        lifecycleStatus: "archived",
        completionStatus: "completed",
      }),
    ).toBe(true);
  });
});
