import "server-only";

import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";
import { z } from "zod";

import {
  SPROUT_MAX_DIRECTION_CHARACTERS,
  SPROUT_MAX_GUIDING_QUESTION_CHARACTERS,
  sproutRecommendedActionSchema,
} from "../../../../validation/sprout-api";

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function boundedProviderText(maximum: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => unicodeLength(value) <= maximum, {
      message: `Text must contain at most ${maximum} Unicode characters`,
    });
}

export const sproutInsufficientReasonSchema = z.enum([
  "too_vague",
  "missing_context",
  "unreadable_link",
  "no_meaningful_content",
]);

export const sproutProviderResultSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("suggestion"),
      direction: boundedProviderText(SPROUT_MAX_DIRECTION_CHARACTERS),
      guidingQuestion: boundedProviderText(SPROUT_MAX_GUIDING_QUESTION_CHARACTERS),
      recommendedAction: sproutRecommendedActionSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("insufficient_content"),
      reason: sproutInsufficientReasonSchema,
    })
    .strict(),
]);

export const sproutProviderEnvelopeSchema = z
  .object({ result: sproutProviderResultSchema })
  .strict();

export type SproutProviderResult = z.infer<typeof sproutProviderResultSchema>;

export const SPROUT_RESPONSE_FORMAT: ResponseFormatTextJSONSchemaConfig = {
  type: "json_schema",
  name: "sprout_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      result: {
        anyOf: [
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["suggestion"] },
              direction: { type: "string" },
              guidingQuestion: { type: "string" },
              recommendedAction: {
                type: "string",
                enum: [
                  "add_content",
                  "record_next_step",
                  "grow_new_idea",
                  "keep_for_later",
                  "mark_completed",
                ],
              },
            },
            required: ["type", "direction", "guidingQuestion", "recommendedAction"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { type: "string", enum: ["insufficient_content"] },
              reason: {
                type: "string",
                enum: ["too_vague", "missing_context", "unreadable_link", "no_meaningful_content"],
              },
            },
            required: ["type", "reason"],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["result"],
    additionalProperties: false,
  },
};
