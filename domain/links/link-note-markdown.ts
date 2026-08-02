import { deriveLocalLinkTitle } from "./external-url";
import { normalizeContentMarkdown, plainTextToMarkdown } from "../fragments/content-markdown";

const GENERIC_PROVIDER_TITLES = new Set([
  "bilibili",
  "untitled",
  "youtube",
  "哔哩哔哩",
  "小红书",
  "微信公众平台",
  "微信公众号",
  "抖音",
  "无标题",
  "知乎",
  "网页",
  "链接",
]);

export const LINK_NOTE_INSUFFICIENT_CONTENT_ERROR = "insufficient_content";

export class LinkNoteContentError extends Error {
  readonly code = LINK_NOTE_INSUFFICIENT_CONTENT_ERROR;

  constructor() {
    super("链接读取完成，但没有得到足够的正文内容。可以稍后重试。");
    this.name = "LinkNoteContentError";
  }
}

export type BuildLinkNoteInput = Readonly<{
  sourceUrl: string;
  providerTitle: string;
  summary: string;
  sourceContent: string;
  userTitle: string | null;
  userNoteMarkdown: string | null;
}>;

export type BuiltLinkNote = Readonly<{
  title: string;
  markdown: string;
}>;

function normalizedGenericTitle(value: string): string {
  return value
    .trim()
    .replace(/[\s\-_|:：·]+/gu, " ")
    .replace(/[.!。！?？]+$/gu, "")
    .trim()
    .toLowerCase();
}

function isGenericProviderTitle(title: string): boolean {
  const normalized = normalizedGenericTitle(title);
  return normalized.length === 0 || GENERIC_PROVIDER_TITLES.has(normalized);
}

function addSection(sections: string[], heading: string, markdown: string): void {
  if (markdown.length > 0) {
    sections.push(`## ${heading}\n\n${markdown}`);
  }
}

/** Converts the bounded GetNote payload into a stable, readable note. */
export function buildLinkNoteMarkdown(input: BuildLinkNoteInput): BuiltLinkNote {
  const sourceContent = normalizeContentMarkdown(input.sourceContent);
  const summary = plainTextToMarkdown(input.summary);
  if (sourceContent.length === 0 && summary.length === 0) {
    throw new LinkNoteContentError();
  }

  const userTitle = input.userTitle?.trim() ?? "";
  const providerTitle = input.providerTitle.trim();
  const title =
    userTitle.length > 0
      ? userTitle
      : isGenericProviderTitle(providerTitle)
        ? deriveLocalLinkTitle(input.sourceUrl)
        : providerTitle;
  const userNote = normalizeContentMarkdown(input.userNoteMarkdown ?? "");
  const sections: string[] = [];

  if (userNote.length > 0) {
    addSection(sections, "我的补充", userNote);
  }

  const shouldIncludeSummary =
    summary.length > 0 && normalizeContentMarkdown(input.summary) !== sourceContent;
  if (shouldIncludeSummary) {
    addSection(sections, "摘要", summary);
  }

  if (sourceContent.length > 0) {
    addSection(sections, "正文", sourceContent);
  }

  const markdown = sections.join("\n\n");
  if (markdown.length === 0) {
    throw new LinkNoteContentError();
  }

  return { title, markdown };
}
