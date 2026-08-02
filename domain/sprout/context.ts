import {
  SPROUT_MAX_ADDITIONS,
  SPROUT_MAX_ADDITION_CHARACTERS,
  SPROUT_MAX_AVOID_DIRECTIONS,
  SPROUT_MAX_AVOID_DIRECTION_CHARACTERS,
  SPROUT_MAX_BODY_CHARACTERS,
  SPROUT_MAX_LINK_SUMMARY_CHARACTERS,
  SPROUT_MAX_LINK_TEXT_CHARACTERS,
  SPROUT_MAX_MEDIA_SUMMARY_CHARACTERS,
  SPROUT_MAX_MEDIA_TRANSCRIPT_CHARACTERS,
  SPROUT_MAX_MEDIA_VISIBLE_TEXT_CHARACTERS,
  SPROUT_MAX_TITLE_CHARACTERS,
  SPROUT_MAX_TOTAL_CHARACTERS,
  type SproutAddition,
  type SproutAnalyzeFragment,
  type SproutAnalyzeRequest,
} from "../../validation/sprout-api";

export type BuildSproutContextInput = Readonly<{
  fragment: Omit<SproutAnalyzeFragment, "additions"> & {
    additions: readonly SproutAddition[];
  };
  avoidDirections: readonly string[];
}>;

type IndexedAddition = Readonly<{
  addition: SproutAddition;
  index: number;
}>;

function truncateUnicode(value: string, maximum: number): string {
  return Array.from(value.trim()).slice(0, maximum).join("");
}

export function buildSproutContext(input: BuildSproutContextInput): SproutAnalyzeRequest {
  let remainingCharacters = SPROUT_MAX_TOTAL_CHARACTERS;

  function take(value: string | null, maximum: number): string | null {
    if (value === null) {
      return null;
    }

    const normalized = truncateUnicode(value, maximum);
    if (normalized.length === 0 || remainingCharacters === 0) {
      return null;
    }

    const selected = truncateUnicode(normalized, remainingCharacters);
    remainingCharacters -= Array.from(selected).length;
    return selected.length === 0 ? null : selected;
  }

  const title = take(input.fragment.title, SPROUT_MAX_TITLE_CHARACTERS) ?? "";
  const avoidDirections = input.avoidDirections
    .slice(-SPROUT_MAX_AVOID_DIRECTIONS)
    .map((direction) => take(direction, SPROUT_MAX_AVOID_DIRECTION_CHARACTERS))
    .filter((direction): direction is string => direction !== null);
  const body = take(input.fragment.body, SPROUT_MAX_BODY_CHARACTERS);
  const indexedAdditions = input.fragment.additions.map((addition, index): IndexedAddition => ({
    addition: { ...addition },
    index,
  }));
  const selectedAdditions: Array<IndexedAddition & { content: string }> = [];

  function takeAdditions(source: SproutAddition["source"]): void {
    for (const candidate of indexedAdditions
      .filter((item) => item.addition.source === source)
      .slice()
      .reverse()) {
      if (selectedAdditions.length >= SPROUT_MAX_ADDITIONS || remainingCharacters === 0) {
        return;
      }

      const content = take(candidate.addition.content, SPROUT_MAX_ADDITION_CHARACTERS);
      if (content !== null) {
        selectedAdditions.push({ ...candidate, content });
      }
    }
  }

  takeAdditions("user");
  const linkSummary = take(input.fragment.linkSummary, SPROUT_MAX_LINK_SUMMARY_CHARACTERS);
  takeAdditions("partner");
  const linkText = take(input.fragment.linkText, SPROUT_MAX_LINK_TEXT_CHARACTERS);
  const mediaSummary = take(
    input.fragment.mediaSummary ?? null,
    SPROUT_MAX_MEDIA_SUMMARY_CHARACTERS,
  );
  const mediaVisibleText = take(
    input.fragment.mediaVisibleText ?? null,
    SPROUT_MAX_MEDIA_VISIBLE_TEXT_CHARACTERS,
  );
  const mediaTranscript = take(
    input.fragment.mediaTranscript ?? null,
    SPROUT_MAX_MEDIA_TRANSCRIPT_CHARACTERS,
  );
  const additions = selectedAdditions
    .sort((left, right) => left.index - right.index)
    .map(({ addition, content }) => ({ source: addition.source, content }));

  return {
    fragment: {
      title,
      body,
      additions,
      linkSummary,
      linkText,
      lifecycleStatus: input.fragment.lifecycleStatus,
      isCompleted: input.fragment.isCompleted,
      isArchived: input.fragment.isArchived,
      growthStage: input.fragment.growthStage,
      ...(mediaSummary !== null ? { mediaSummary } : {}),
      ...(mediaVisibleText !== null ? { mediaVisibleText } : {}),
      ...(mediaTranscript !== null ? { mediaTranscript } : {}),
      ...(input.fragment.mediaContentKind !== undefined
        ? { mediaContentKind: input.fragment.mediaContentKind }
        : {}),
    },
    avoidDirections,
  };
}
