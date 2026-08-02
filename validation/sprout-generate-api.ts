import { z } from "zod";

import {
  sproutApiErrorCodeSchema,
  sproutApiErrorSchema,
  type SproutApiErrorCode,
} from "./sprout-api";

export const SPROUT_GENERATE_MAX_TITLE_CHARACTERS = 100;
export const SPROUT_GENERATE_MAX_MARKDOWN_CHARACTERS = 12_000;
export const SPROUT_GENERATE_MAX_SOURCE_TITLE_CHARACTERS = 300;
export const SPROUT_GENERATE_MAX_SOURCE_MARKDOWN_CHARACTERS = 20_000;
export const SPROUT_GENERATE_MAX_NOTE_CHARACTERS = 5_000;
export const SPROUT_GENERATE_MAX_NOTES = 1_000;
export const SPROUT_GENERATE_MAX_SOURCE_NAME_CHARACTERS = 500;
export const SPROUT_GENERATE_MAX_EXISTING_TITLES = 50;
export const SPROUT_GENERATE_MAX_EXISTING_TITLE_CHARACTERS = 300;
export const SPROUT_GENERATE_MAX_TOTAL_CHARACTERS = 40_000;

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function boundedText(maximum: number, options: { allowEmpty?: boolean } = {}) {
  return z
    .string()
    .refine((value) => options.allowEmpty === true || value.trim().length > 0, {
      message: "Text cannot be empty",
    })
    .refine((value) => unicodeLength(value) <= maximum, {
      message: `Text must contain at most ${maximum} Unicode characters`,
    });
}

const isoTimestampSchema = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && value.includes("T");
}, "Timestamp must be an ISO date-time string");

export const sproutGenerateNoteSchema = z
  .object({
    contentMarkdown: boundedText(SPROUT_GENERATE_MAX_NOTE_CHARACTERS),
    createdAt: isoTimestampSchema,
  })
  .strict();

export const sproutGenerateSourceSchema = z
  .object({
    id: z.uuid(),
    title: boundedText(SPROUT_GENERATE_MAX_SOURCE_TITLE_CHARACTERS),
    contentMarkdown: boundedText(SPROUT_GENERATE_MAX_SOURCE_MARKDOWN_CHARACTERS, {
      allowEmpty: true,
    }),
    notes: z.array(sproutGenerateNoteSchema).max(SPROUT_GENERATE_MAX_NOTES),
    sourceType: z.enum(["text", "link", "image", "voice"]),
    sourceName: boundedText(SPROUT_GENERATE_MAX_SOURCE_NAME_CHARACTERS).nullable(),
    existingSproutTitles: z
      .array(boundedText(SPROUT_GENERATE_MAX_EXISTING_TITLE_CHARACTERS))
      .max(SPROUT_GENERATE_MAX_EXISTING_TITLES),
  })
  .strict();

export const sproutGenerateRequestSchema = z
  .object({ source: sproutGenerateSourceSchema })
  .strict()
  .superRefine((request, context) => {
    const values = [
      request.source.title,
      request.source.contentMarkdown,
      request.source.sourceName ?? "",
      ...request.source.notes.map((note) => note.contentMarkdown),
      ...request.source.existingSproutTitles,
    ];
    const totalCharacters = values.reduce((total, value) => total + unicodeLength(value), 0);
    const hasReadableContent =
      request.source.contentMarkdown.trim().length > 0 || request.source.notes.length > 0;

    if (!hasReadableContent) {
      context.addIssue({
        code: "custom",
        path: ["source", "contentMarkdown"],
        message: "Sprout generation requires readable note content",
      });
    }
    if (totalCharacters > SPROUT_GENERATE_MAX_TOTAL_CHARACTERS) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: `Sprout generation context must contain at most ${SPROUT_GENERATE_MAX_TOTAL_CHARACTERS} Unicode characters`,
      });
    }
  });

export const sproutGeneratedNoteSchema = z
  .object({
    title: boundedText(SPROUT_GENERATE_MAX_TITLE_CHARACTERS),
    markdown: boundedText(SPROUT_GENERATE_MAX_MARKDOWN_CHARACTERS),
  })
  .strict();

export { sproutApiErrorCodeSchema as sproutGenerateApiErrorCodeSchema };
export { sproutApiErrorSchema as sproutGenerateApiErrorSchema };
export type SproutGenerateApiErrorCode = SproutApiErrorCode;
export type SproutGenerateRequest = z.infer<typeof sproutGenerateRequestSchema>;
export type SproutGeneratedNote = z.infer<typeof sproutGeneratedNoteSchema>;
