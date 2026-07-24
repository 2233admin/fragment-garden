import { z } from "zod";

import { externalUrlSchema } from "./external-url";

export const COMPANION_MAX_MESSAGES = 20;
export const COMPANION_MAX_MESSAGE_CHARACTERS = 4_000;
export const COMPANION_MAX_TOTAL_CHARACTERS = 12_000;
export const COMPANION_MAX_ALLOWED_OPEN_FRAGMENTS = 3;
export const COMPANION_MAX_FRAGMENT_TITLE_CHARACTERS = 200;
export const COMPANION_MAX_FRAGMENT_STATUS_CHARACTERS = 80;
export const COMPANION_MAX_TOOL_CALL_ID_CHARACTERS = 200;

function boundedText(maxCharacters: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= maxCharacters, {
      message: `Text must contain at most ${maxCharacters} Unicode characters`,
    });
}

function boundedOptionalText(maxCharacters: number) {
  return z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= maxCharacters, {
      message: `Text must contain at most ${maxCharacters} Unicode characters`,
    });
}

export const companionRoleSchema = z.enum(["user", "assistant"]);
export const companionToolNameSchema = z.enum([
  "recommend_fragment",
  "open_fragment",
  "import_link",
]);

export const companionMessageInputSchema = z
  .object({
    role: companionRoleSchema,
    content: boundedText(COMPANION_MAX_MESSAGE_CHARACTERS),
  })
  .strict();

export const gardenSummarySchema = z
  .object({
    activeCount: z.number().int().nonnegative().max(1_000_000),
    dormantCount: z.number().int().nonnegative().max(1_000_000),
    completedCount: z.number().int().nonnegative().max(1_000_000),
    archivedCount: z.number().int().nonnegative().max(1_000_000),
  })
  .strict();

export const allowedOpenFragmentSchema = z
  .object({
    id: boundedText(COMPANION_MAX_TOOL_CALL_ID_CHARACTERS),
    title: boundedOptionalText(COMPANION_MAX_FRAGMENT_TITLE_CHARACTERS),
    status: boundedOptionalText(COMPANION_MAX_FRAGMENT_STATUS_CHARACTERS),
  })
  .strict();

export const companionRespondRequestSchema = z
  .object({
    messages: z.array(companionMessageInputSchema).min(1).max(COMPANION_MAX_MESSAGES),
    gardenSummary: gardenSummarySchema,
    allowedOpenFragments: z
      .array(allowedOpenFragmentSchema)
      .max(COMPANION_MAX_ALLOWED_OPEN_FRAGMENTS),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.messages.some((message) => message.role === "user")) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "At least one user message is required",
      });
    }

    const totalCharacters = value.messages.reduce(
      (total, message) => total + Array.from(message.content).length,
      0,
    );
    if (totalCharacters > COMPANION_MAX_TOTAL_CHARACTERS) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: `Messages must contain at most ${COMPANION_MAX_TOTAL_CHARACTERS} Unicode characters`,
      });
    }
  });

export const importLinkToolArgumentsSchema = z
  .object({
    url: externalUrlSchema,
    title: boundedOptionalText(COMPANION_MAX_FRAGMENT_TITLE_CHARACTERS).nullable(),
  })
  .strict();

export const openFragmentToolArgumentsSchema = z
  .object({
    fragmentId: boundedText(COMPANION_MAX_TOOL_CALL_ID_CHARACTERS),
  })
  .strict();

export const recommendFragmentToolArgumentsSchema = z.object({}).strict();

export const companionApiResultSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("message"),
      message: boundedText(COMPANION_MAX_MESSAGE_CHARACTERS),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_call"),
      callId: boundedText(COMPANION_MAX_TOOL_CALL_ID_CHARACTERS),
      name: companionToolNameSchema,
      arguments: z.unknown(),
    })
    .strict(),
]);

export const companionApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(80),
        message: z.string().trim().min(1).max(500),
      })
      .strict(),
  })
  .strict();

export type CompanionRespondRequest = z.infer<typeof companionRespondRequestSchema>;
export type CompanionApiResult = z.infer<typeof companionApiResultSchema>;
export type CompanionToolName = z.infer<typeof companionToolNameSchema>;
export type ImportLinkToolArguments = z.infer<typeof importLinkToolArgumentsSchema>;
export type OpenFragmentToolArguments = z.infer<typeof openFragmentToolArgumentsSchema>;
