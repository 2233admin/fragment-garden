import { z } from "zod";

import type { SproutRecommendedAction as DomainSproutRecommendedAction } from "../domain/shared/types";
import {
  SPROUT_MAX_DIRECTION_CHARACTERS,
  SPROUT_MAX_GUIDING_QUESTION_CHARACTERS,
} from "../domain/sprout/constants";

export {
  SPROUT_MAX_DIRECTION_CHARACTERS,
  SPROUT_MAX_GUIDING_QUESTION_CHARACTERS,
} from "../domain/sprout/constants";

export const SPROUT_MAX_TITLE_CHARACTERS = 300;
export const SPROUT_MAX_BODY_CHARACTERS = 6_000;
export const SPROUT_MAX_ADDITIONS = 10;
export const SPROUT_MAX_ADDITION_CHARACTERS = 1_500;
export const SPROUT_MAX_LINK_SUMMARY_CHARACTERS = 2_000;
export const SPROUT_MAX_LINK_TEXT_CHARACTERS = 8_000;
export const SPROUT_MAX_AVOID_DIRECTIONS = 3;
export const SPROUT_MAX_AVOID_DIRECTION_CHARACTERS = 500;
export const SPROUT_MAX_TOTAL_CHARACTERS = 16_000;
export const SPROUT_MAX_MEDIA_SUMMARY_CHARACTERS = 2_000;
export const SPROUT_MAX_MEDIA_VISIBLE_TEXT_CHARACTERS = 6_000;
export const SPROUT_MAX_MEDIA_TRANSCRIPT_CHARACTERS = 12_000;

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function boundedText(maxCharacters: number, options: { allowEmpty?: boolean } = {}) {
  const schema = z.string().refine((value) => unicodeLength(value) <= maxCharacters, {
    message: `Text must contain at most ${maxCharacters} Unicode characters`,
  });

  return options.allowEmpty === true
    ? schema
    : schema.refine((value) => value.trim().length > 0, { message: "Text cannot be empty" });
}

export const sproutRecommendedActionSchema: z.ZodType<DomainSproutRecommendedAction> = z.enum([
  "add_content",
  "record_next_step",
  "grow_new_idea",
  "keep_for_later",
  "mark_completed",
]);

export const sproutAdditionSchema = z
  .object({
    source: z.enum(["user", "partner"]),
    content: boundedText(SPROUT_MAX_ADDITION_CHARACTERS),
  })
  .strict();

export const sproutAnalyzeFragmentSchema = z
  .object({
    title: boundedText(SPROUT_MAX_TITLE_CHARACTERS, { allowEmpty: true }),
    body: boundedText(SPROUT_MAX_BODY_CHARACTERS, { allowEmpty: true }).nullable(),
    additions: z.array(sproutAdditionSchema).max(SPROUT_MAX_ADDITIONS),
    linkSummary: boundedText(SPROUT_MAX_LINK_SUMMARY_CHARACTERS, { allowEmpty: true }).nullable(),
    linkText: boundedText(SPROUT_MAX_LINK_TEXT_CHARACTERS, { allowEmpty: true }).nullable(),
    lifecycleStatus: z.enum(["active", "dormant", "archived"]),
    isCompleted: z.boolean(),
    isArchived: z.boolean(),
    growthStage: z
      .enum(["seedling", "growing", "budding", "blooming", "permanent_bloom"])
      .nullable(),
    mediaSummary: boundedText(SPROUT_MAX_MEDIA_SUMMARY_CHARACTERS, { allowEmpty: true })
      .nullable()
      .optional(),
    mediaVisibleText: boundedText(SPROUT_MAX_MEDIA_VISIBLE_TEXT_CHARACTERS, { allowEmpty: true })
      .nullable()
      .optional(),
    mediaTranscript: boundedText(SPROUT_MAX_MEDIA_TRANSCRIPT_CHARACTERS, { allowEmpty: true })
      .nullable()
      .optional(),
    mediaContentKind: z
      .enum(["screenshot", "document", "photo", "diagram", "other"])
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((fragment, context) => {
    if ((fragment.lifecycleStatus === "archived") !== fragment.isArchived) {
      context.addIssue({
        code: "custom",
        path: ["isArchived"],
        message: "Archived state is inconsistent",
      });
    }

    if (fragment.isCompleted && fragment.growthStage !== "permanent_bloom") {
      context.addIssue({
        code: "custom",
        path: ["growthStage"],
        message: "Completed fragments must remain in permanent bloom",
      });
    }
  });

export const sproutAnalyzeRequestSchema = z
  .object({
    fragment: sproutAnalyzeFragmentSchema,
    avoidDirections: z
      .array(boundedText(SPROUT_MAX_AVOID_DIRECTION_CHARACTERS))
      .max(SPROUT_MAX_AVOID_DIRECTIONS),
  })
  .strict()
  .superRefine((request, context) => {
    const totalCharacters = [
      request.fragment.title,
      request.fragment.body ?? "",
      ...request.fragment.additions.map((addition) => addition.content),
      request.fragment.linkSummary ?? "",
      request.fragment.linkText ?? "",
      request.fragment.mediaSummary ?? "",
      request.fragment.mediaVisibleText ?? "",
      request.fragment.mediaTranscript ?? "",
      ...request.avoidDirections,
    ].reduce((total, value) => total + unicodeLength(value), 0);

    if (totalCharacters === 0) {
      context.addIssue({
        code: "custom",
        path: ["fragment"],
        message: "Fragment content cannot be empty",
      });
    }

    if (totalCharacters > SPROUT_MAX_TOTAL_CHARACTERS) {
      context.addIssue({
        code: "custom",
        path: ["fragment"],
        message: `Sprout context must contain at most ${SPROUT_MAX_TOTAL_CHARACTERS} Unicode characters`,
      });
    }
  });

export const sproutApiResultSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("suggestion"),
      direction: boundedText(SPROUT_MAX_DIRECTION_CHARACTERS),
      guidingQuestion: boundedText(SPROUT_MAX_GUIDING_QUESTION_CHARACTERS),
      recommendedAction: sproutRecommendedActionSchema,
    })
    .strict(),
  z.object({ type: z.literal("insufficient_content") }).strict(),
]);

export const sproutApiErrorCodeSchema = z.enum([
  "sprout_disabled",
  "missing_configuration",
  "authentication_failed",
  "rate_limited",
  "model_unavailable",
  "request_timeout",
  "response_incomplete",
  "invalid_model_response",
  "provider_error",
  "content_too_large",
  "request_validation_failed",
]);

export const sproutApiErrorSchema = z
  .object({
    error: z
      .object({
        code: sproutApiErrorCodeSchema,
        message: z.string().trim().min(1).max(500),
      })
      .strict(),
  })
  .strict();

export type SproutRecommendedAction = DomainSproutRecommendedAction;
export type SproutAddition = z.infer<typeof sproutAdditionSchema>;
export type SproutAnalyzeFragment = z.infer<typeof sproutAnalyzeFragmentSchema>;
export type SproutAnalyzeRequest = z.infer<typeof sproutAnalyzeRequestSchema>;
export type SproutApiResult = z.infer<typeof sproutApiResultSchema>;
export type SproutSuggestion = Extract<SproutApiResult, { type: "suggestion" }>;
export type SproutApiErrorCode = z.infer<typeof sproutApiErrorCodeSchema>;
