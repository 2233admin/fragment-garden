import type { SproutAddition } from "../../validation/sprout-api";

const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const GENERIC_CONTENT = new Set([
  "链接",
  "链接碎片",
  "正在读取",
  "正在读取链接",
  "读取中",
  "外部链接",
  "网页",
  "视频",
  "小红书",
  "抖音",
  "xiaohongshu",
  "douyin",
  "未命名",
  "未命名碎片",
]);

export type SproutContentReadinessInput = Readonly<{
  title: string;
  body: string | null;
  additions: readonly SproutAddition[];
  linkSummary: string | null;
  linkText: string | null;
  sourceUrl: string | null;
  mediaSummary?: string | null;
  mediaVisibleText?: string | null;
  mediaTranscript?: string | null;
  /** Media titles are labels, not sufficient evidence for a sprout request. */
  mediaKind?: "image" | "audio";
}>;

export type SproutContentReadiness =
  | Readonly<{ isReady: true }>
  | Readonly<{
      isReady: false;
      reason: "no_meaningful_content" | "unreadable_link";
    }>;

function normalizeCandidate(value: string): string {
  return value
    .replace(URL_PATTERN, " ")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function isGenericLinkTitle(value: string): boolean {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase();
  return /^来自\s+[^\s]+\s+的链接$/u.test(normalized);
}

function hasMeaningfulText(value: string, isTitle = false): boolean {
  const normalized = normalizeCandidate(value);

  if (normalized.length === 0 || GENERIC_CONTENT.has(normalized)) {
    return false;
  }

  return !(isTitle && isGenericLinkTitle(value));
}

export function evaluateSproutContentReadiness(
  input: SproutContentReadinessInput,
): SproutContentReadiness {
  const hasMeaningfulTitle =
    input.mediaKind === undefined ? hasMeaningfulText(input.title, true) : false;
  const hasMeaningfulBody = hasMeaningfulText(input.body ?? "");
  const hasMeaningfulAddition = input.additions.some((addition) =>
    hasMeaningfulText(addition.content),
  );
  const hasMeaningfulSummary = hasMeaningfulText(input.linkSummary ?? "");
  const hasMeaningfulLinkText = hasMeaningfulText(input.linkText ?? "");
  const hasMeaningfulLinkContent =
    hasMeaningfulBody || hasMeaningfulAddition || hasMeaningfulSummary || hasMeaningfulLinkText;
  const hasMeaningfulMediaContent =
    hasMeaningfulText(input.mediaSummary ?? "") ||
    hasMeaningfulText(input.mediaVisibleText ?? "") ||
    hasMeaningfulText(input.mediaTranscript ?? "");

  // Imported titles can look specific even when the provider returned no readable content.
  // A link needs body, summary, extracted text, or an explicit user addition before AI analysis.
  if (input.sourceUrl !== null) {
    return hasMeaningfulLinkContent
      ? { isReady: true }
      : { isReady: false, reason: "unreadable_link" };
  }

  if (hasMeaningfulTitle || hasMeaningfulLinkContent || hasMeaningfulMediaContent) {
    return { isReady: true };
  }

  return {
    isReady: false,
    reason: "no_meaningful_content",
  };
}
