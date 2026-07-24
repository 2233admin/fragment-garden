import { z } from "zod";

import type {
  ArchivedEventPayload,
  ChildFragmentCreatedEventPayload,
  CompletedEventPayload,
  FragmentReviewDecision,
  PartnerSuggestionSavedEventPayload,
  RestoredEventPayload,
  ReviewedEventPayload,
  TextAddedEventPayload,
} from "../domain";
import { isLocalDateKey } from "../domain/sprout/local-date";
import {
  SPROUT_MAX_DIRECTION_CHARACTERS,
  SPROUT_MAX_GUIDING_QUESTION_CHARACTERS,
  SPROUT_MAX_PROMPT_VERSION_CHARACTERS,
} from "../domain/sprout/constants";
import { sproutRecommendedActionSchema } from "./sprout-api";

function boundedUnicodeText(maxCharacters: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= maxCharacters, {
      message: `Text must contain at most ${maxCharacters} Unicode characters`,
    });
}

export const fragmentReviewDecisionSchema: z.ZodType<FragmentReviewDecision> = z.enum([
  "still_interested",
  "not_now",
  "no_longer_needed",
]);

export const textAddedEventPayloadSchema: z.ZodType<TextAddedEventPayload> = z
  .object({
    text: z.string().trim().min(1),
  })
  .strict();

export const reviewedEventPayloadSchema: z.ZodType<ReviewedEventPayload> = z
  .object({
    decision: fragmentReviewDecisionSchema,
  })
  .strict();

export const completedEventPayloadSchema: z.ZodType<CompletedEventPayload> = z
  .object({
    outcome: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .transform((outcome) => (outcome === "" ? null : outcome)),
  })
  .strict();

export const childFragmentCreatedEventPayloadSchema: z.ZodType<ChildFragmentCreatedEventPayload> = z
  .object({
    childFragmentId: z.string().trim().min(1),
  })
  .strict();

export const partnerSuggestionSavedEventPayloadSchema: z.ZodType<PartnerSuggestionSavedEventPayload> =
  z
    .object({
      direction: boundedUnicodeText(SPROUT_MAX_DIRECTION_CHARACTERS),
      guidingQuestion: boundedUnicodeText(SPROUT_MAX_GUIDING_QUESTION_CHARACTERS),
      recommendedAction: sproutRecommendedActionSchema,
      source: z.literal("partner"),
      promptVersion: boundedUnicodeText(SPROUT_MAX_PROMPT_VERSION_CHARACTERS),
      localDateKey: z.string().refine(isLocalDateKey, {
        message: "A valid local date key is required",
      }),
    })
    .strict();

export const archivedEventPayloadSchema: z.ZodType<ArchivedEventPayload> = z
  .object({
    previousSlotId: z.string().trim().min(1).nullable(),
  })
  .strict();

export const restoredEventPayloadSchema: z.ZodType<RestoredEventPayload> = z
  .object({
    reason: z.enum(["viewed", "reviewed", "manual_restore", "content_updated"]),
  })
  .strict();

export function parseTextAddedEventPayload(payload: unknown): TextAddedEventPayload {
  return textAddedEventPayloadSchema.parse(payload);
}

export function safelyParseTextAddedEventPayload(payload: unknown): TextAddedEventPayload | null {
  const result = textAddedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseReviewedEventPayload(payload: unknown): ReviewedEventPayload {
  return reviewedEventPayloadSchema.parse(payload);
}

export function safelyParseReviewedEventPayload(payload: unknown): ReviewedEventPayload | null {
  const result = reviewedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseCompletedEventPayload(payload: unknown): CompletedEventPayload {
  return completedEventPayloadSchema.parse(payload);
}

export function safelyParseCompletedEventPayload(payload: unknown): CompletedEventPayload | null {
  const result = completedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseChildFragmentCreatedEventPayload(
  payload: unknown,
): ChildFragmentCreatedEventPayload {
  return childFragmentCreatedEventPayloadSchema.parse(payload);
}

export function safelyParseChildFragmentCreatedEventPayload(
  payload: unknown,
): ChildFragmentCreatedEventPayload | null {
  const result = childFragmentCreatedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parsePartnerSuggestionSavedEventPayload(
  payload: unknown,
): PartnerSuggestionSavedEventPayload {
  return partnerSuggestionSavedEventPayloadSchema.parse(payload);
}

export function safelyParsePartnerSuggestionSavedEventPayload(
  payload: unknown,
): PartnerSuggestionSavedEventPayload | null {
  const result = partnerSuggestionSavedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseArchivedEventPayload(payload: unknown): ArchivedEventPayload {
  return archivedEventPayloadSchema.parse(payload);
}

export function safelyParseArchivedEventPayload(payload: unknown): ArchivedEventPayload | null {
  const result = archivedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}

export function parseRestoredEventPayload(payload: unknown): RestoredEventPayload {
  return restoredEventPayloadSchema.parse(payload);
}

export function safelyParseRestoredEventPayload(payload: unknown): RestoredEventPayload | null {
  const result = restoredEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}
