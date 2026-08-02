import {
  SPROUT_GENERATE_MAX_EXISTING_TITLE_CHARACTERS,
  SPROUT_GENERATE_MAX_EXISTING_TITLES,
  SPROUT_GENERATE_MAX_MARKDOWN_CHARACTERS,
  SPROUT_GENERATE_MAX_NOTE_CHARACTERS,
  SPROUT_GENERATE_MAX_NOTES,
  SPROUT_GENERATE_MAX_SOURCE_MARKDOWN_CHARACTERS,
  SPROUT_GENERATE_MAX_SOURCE_NAME_CHARACTERS,
  SPROUT_GENERATE_MAX_SOURCE_TITLE_CHARACTERS,
  SPROUT_GENERATE_MAX_TOTAL_CHARACTERS,
  sproutGenerateRequestSchema,
  type SproutGenerateRequest,
} from "../../validation/sprout-generate-api";
import { normalizeContentMarkdown } from "../fragments/content-markdown";

export type SproutGenerateSourceType = "text" | "link" | "image" | "voice";

export type BuildSproutGenerateContextInput = Readonly<{
  id: string;
  title: string;
  contentMarkdown: string;
  notes: readonly Readonly<{ contentMarkdown: string; createdAt: string }>[];
  sourceType: SproutGenerateSourceType;
  sourceName: string | null;
  existingSproutTitles: readonly string[];
}>;

function truncateUnicode(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}

function normalizedBounded(value: string, maximum: number): string {
  return truncateUnicode(normalizeContentMarkdown(value), maximum);
}

export function buildSproutGenerateContext(
  input: BuildSproutGenerateContextInput,
): SproutGenerateRequest {
  const title = normalizedBounded(input.title, SPROUT_GENERATE_MAX_SOURCE_TITLE_CHARACTERS);
  const sourceName =
    input.sourceName === null
      ? null
      : normalizedBounded(input.sourceName, SPROUT_GENERATE_MAX_SOURCE_NAME_CHARACTERS) || null;
  const existingSproutTitles = [...new Set(input.existingSproutTitles)]
    .map((candidate) => normalizedBounded(candidate, SPROUT_GENERATE_MAX_EXISTING_TITLE_CHARACTERS))
    .filter((candidate) => candidate.length > 0)
    .slice(0, SPROUT_GENERATE_MAX_EXISTING_TITLES);
  const normalizedNotes = input.notes
    .map((note) => ({
      contentMarkdown: normalizeContentMarkdown(note.contentMarkdown),
      createdAt: note.createdAt,
    }))
    .filter((note) => note.contentMarkdown.length > 0)
    .slice(0, SPROUT_GENERATE_MAX_NOTES);

  const fixedCharacters = [title, sourceName ?? "", ...existingSproutTitles].reduce(
    (total, value) => total + Array.from(value).length,
    0,
  );
  const reservedNoteCharacters = normalizedNotes.length;
  let remainingCharacters = Math.max(
    0,
    SPROUT_GENERATE_MAX_TOTAL_CHARACTERS - fixedCharacters - reservedNoteCharacters,
  );
  const contentMarkdown = normalizedBounded(
    input.contentMarkdown,
    Math.min(SPROUT_GENERATE_MAX_SOURCE_MARKDOWN_CHARACTERS, remainingCharacters),
  );
  remainingCharacters -= Array.from(contentMarkdown).length;

  const notes = normalizedNotes.map((note, index) => {
    const remainingNotes = normalizedNotes.length - index;
    const fairShare = Math.max(1, Math.floor(remainingCharacters / remainingNotes));
    const content = normalizedBounded(
      note.contentMarkdown,
      Math.min(SPROUT_GENERATE_MAX_NOTE_CHARACTERS, fairShare),
    );
    remainingCharacters = Math.max(0, remainingCharacters - Array.from(content).length);
    return { contentMarkdown: content, createdAt: note.createdAt };
  });

  return sproutGenerateRequestSchema.parse({
    source: {
      id: input.id,
      title,
      contentMarkdown,
      notes,
      sourceType: input.sourceType,
      sourceName,
      existingSproutTitles,
    },
  });
}

export function isSproutGenerateContextReady(input: BuildSproutGenerateContextInput): boolean {
  return (
    normalizeContentMarkdown(input.contentMarkdown).length > 0 ||
    input.notes.some((note) => normalizeContentMarkdown(note.contentMarkdown).length > 0)
  );
}

export function normalizeSproutGeneratedPreview(
  title: string,
  markdown: string,
): Readonly<{ title: string; markdown: string }> {
  return {
    title: truncateUnicode(title.trim(), SPROUT_GENERATE_MAX_SOURCE_TITLE_CHARACTERS),
    markdown: truncateUnicode(
      normalizeContentMarkdown(markdown),
      SPROUT_GENERATE_MAX_MARKDOWN_CHARACTERS,
    ),
  };
}
