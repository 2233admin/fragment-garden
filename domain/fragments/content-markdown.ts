import type { ExternalLinkImport, Fragment, MediaAsset } from "../shared/types";

type FragmentContentSource = Omit<Fragment, "contentMarkdown"> & {
  contentMarkdown?: string;
};

const FALLBACK_CONTENT: Readonly<Record<Fragment["contentType"], string>> = {
  text: "这条笔记暂时没有可用的正文。",
  link: "这条链接暂时没有可用的整理笔记。",
  image: "这张图片暂时没有可用的整理笔记。",
  audio: "这段语音暂时没有可用的转写。",
};

export function normalizeContentMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/gu, "\n").trim();
}

function escapePlainTextLine(line: string): string {
  return line
    .replace(/\\/gu, "\\\\")
    .replace(/([`*_{}\[\]<>#!|])/gu, "\\$1")
    .replace(/^(\s*)([-+])(?=\s)/u, "$1\\$2")
    .replace(/^(\s*)(\d+)\.(?=\s)/u, "$1$2\\.");
}

/** Converts legacy plain text without allowing Markdown-looking text to become formatting. */
export function plainTextToMarkdown(text: string): string {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  if (normalized.length === 0) return "";

  return normalized
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.split("\n").map(escapePlainTextLine).join("  \n"))
    .join("\n\n");
}

function addUniqueSection(sections: string[], markdown: string): void {
  const normalized = normalizeContentMarkdown(markdown);
  if (normalized.length > 0 && !sections.includes(normalized)) {
    sections.push(normalized);
  }
}

function resolveLegacyDerivedSections(
  fragment: FragmentContentSource,
  externalLinkImport: ExternalLinkImport | null,
  mediaAsset: MediaAsset | null,
): string[] {
  const sections: string[] = [];

  if (fragment.contentType === "text") {
    addUniqueSection(sections, plainTextToMarkdown(fragment.rawText ?? ""));
    if (sections.length === 0) {
      addUniqueSection(sections, plainTextToMarkdown(fragment.summary ?? ""));
    }
    if (sections.length === 0) {
      addUniqueSection(sections, plainTextToMarkdown(fragment.title));
    }
  } else if (fragment.contentType === "link") {
    addUniqueSection(sections, plainTextToMarkdown(externalLinkImport?.sourceContent ?? ""));
    addUniqueSection(sections, plainTextToMarkdown(fragment.summary ?? ""));
    addUniqueSection(sections, plainTextToMarkdown(fragment.rawText ?? ""));
    if (sections.length === 0) {
      addUniqueSection(sections, plainTextToMarkdown(fragment.title));
    }
    if (sections.length <= 1 && fragment.sourceUrl !== null) {
      addUniqueSection(sections, plainTextToMarkdown(`来源链接：${fragment.sourceUrl}`));
    }
  } else if (fragment.contentType === "image") {
    addUniqueSection(sections, plainTextToMarkdown(mediaAsset?.summary ?? fragment.summary ?? ""));
    addUniqueSection(sections, plainTextToMarkdown(mediaAsset?.visibleText ?? ""));
    addUniqueSection(sections, plainTextToMarkdown(fragment.rawText ?? ""));
  } else if (fragment.contentType === "audio") {
    addUniqueSection(sections, plainTextToMarkdown(mediaAsset?.transcript ?? ""));
    addUniqueSection(sections, plainTextToMarkdown(fragment.rawText ?? ""));
  }

  return sections;
}

/**
 * Resolves the readable V5 body for a Fragment while preserving any existing
 * user-authored Markdown. Optional related records are always for this Fragment.
 */
export function resolveFragmentContentMarkdown(
  fragment: FragmentContentSource,
  externalLinkImport: ExternalLinkImport | null = null,
  mediaAsset: MediaAsset | null = null,
): string {
  const existing = normalizeContentMarkdown(fragment.contentMarkdown ?? "");
  if (existing.length > 0) return existing;

  const sections = resolveLegacyDerivedSections(fragment, externalLinkImport, mediaAsset);
  if (sections.length > 0) return sections.join("\n\n");

  return plainTextToMarkdown(FALLBACK_CONTENT[fragment.contentType]);
}

/** Produces stable card/search text without interpreting raw HTML. */
export function markdownToPlainText(markdown: string): string {
  const escapedCharacters: string[] = [];
  const withProtectedEscapes = normalizeContentMarkdown(markdown).replace(
    /\\([\\`*_{}\[\]<>#!|+\-.])/gu,
    (_match, escapedCharacter: string) => {
      const index = escapedCharacters.push(escapedCharacter) - 1;
      return `\uE000${index}\uE001`;
    },
  );

  return withProtectedEscapes
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-+*]|\d+\.)\s+/gmu, "")
    .replace(/```[\s\S]*?```/gu, (block) => block.replace(/^```[^\n]*\n?|```$/gu, ""))
    .replace(/`([^`]*)`/gu, "$1")
    .replace(/[*_~]/gu, "")
    .replace(/<[^>]*>/gu, "")
    .replace(
      /\uE000(\d+)\uE001/gu,
      (_match, index: string) => escapedCharacters[Number(index)] ?? "",
    )
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .trim();
}
