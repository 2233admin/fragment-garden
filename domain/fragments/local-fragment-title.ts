const LOCAL_FRAGMENT_TITLE_MAX_GRAPHEMES = 30;
const LOCAL_FRAGMENT_TITLE_CONTENT_GRAPHEMES = LOCAL_FRAGMENT_TITLE_MAX_GRAPHEMES - 1;
const UNTITLED_FRAGMENT_TITLE = "未命名碎片";

function splitGraphemes(value: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(value), ({ segment }) => segment);
}

export function deriveLocalFragmentTitle(rawText: string): string {
  const firstNonEmptyLine = rawText
    .split(/\r\n?|\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (firstNonEmptyLine === undefined) {
    return UNTITLED_FRAGMENT_TITLE;
  }

  const normalizedLine = firstNonEmptyLine.replace(/\s+/gu, " ");
  const graphemes = splitGraphemes(normalizedLine);

  if (graphemes.length <= LOCAL_FRAGMENT_TITLE_MAX_GRAPHEMES) {
    return normalizedLine;
  }

  return `${graphemes.slice(0, LOCAL_FRAGMENT_TITLE_CONTENT_GRAPHEMES).join("")}…`;
}
