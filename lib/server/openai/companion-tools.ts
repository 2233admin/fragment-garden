import { z } from "zod";
import type { FunctionTool } from "openai/resources/responses/responses";

import {
  allowedOpenFragmentSchema,
  importLinkArgumentsSchema,
  openFragmentArgumentsSchema,
  recommendFragmentArgumentsSchema,
  type AllowedOpenFragmentInput,
  type ImportLinkArguments,
  type OpenFragmentArguments,
  type RecommendFragmentArguments,
} from "./companion-schemas";
import { CompanionError } from "./companion-errors";
import { normalizeExternalUrl } from "../../../domain/links/external-url";

export const COMPANION_TOOLS: readonly FunctionTool[] = [
  {
    type: "function",
    name: "recommend_fragment",
    description: "Recommend one eligible older fragment using the local deterministic service.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "open_fragment",
    description: "Open a fragment only when its id is present in the supplied allowed list.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        fragmentId: { type: "string" },
      },
      required: ["fragmentId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "import_link",
    description: "Save a user-provided HTTP or HTTPS link through the existing local import flow.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        title: { type: ["string", "null"] },
      },
      required: ["url", "title"],
      additionalProperties: false,
    },
  },
];

export type CompanionToolCall =
  | Readonly<{
      type: "tool_call";
      callId: string;
      name: "recommend_fragment";
      arguments: RecommendFragmentArguments;
    }>
  | Readonly<{
      type: "tool_call";
      callId: string;
      name: "open_fragment";
      arguments: OpenFragmentArguments;
    }>
  | Readonly<{
      type: "tool_call";
      callId: string;
      name: "import_link";
      arguments: ImportLinkArguments;
    }>;

const toolCallIdSchema = z.string().trim().min(1).max(200);
const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const TRAILING_URL_PUNCTUATION = /[.,!?;:，。！？；：、）】》」』]+$/u;

function extractUserUrls(messages: readonly string[]): Set<string> {
  const normalizedUrls = new Set<string>();

  for (const message of messages) {
    for (const match of message.matchAll(URL_CANDIDATE_PATTERN)) {
      const candidate = match[0]?.replace(TRAILING_URL_PUNCTUATION, "");
      if (candidate === undefined) {
        continue;
      }

      try {
        normalizedUrls.add(normalizeExternalUrl(candidate));
      } catch {
        // Invalid candidates are rejected by the normal URL schema below.
      }
    }
  }

  return normalizedUrls;
}

function isUserProvidedUrl(url: string, userMessages: readonly string[]): boolean {
  try {
    return extractUserUrls(userMessages).has(normalizeExternalUrl(url));
  } catch {
    return false;
  }
}

function parseRawArguments(rawArguments: unknown): unknown {
  if (typeof rawArguments !== "string") {
    return rawArguments;
  }

  try {
    return JSON.parse(rawArguments) as unknown;
  } catch (error) {
    throw new CompanionError("tool_validation_failed", { cause: error });
  }
}

function parseToolArguments<T>(schema: z.ZodType<T>, rawArguments: unknown): T {
  const result = schema.safeParse(parseRawArguments(rawArguments));
  if (!result.success) {
    throw new CompanionError("tool_validation_failed", { cause: result.error });
  }
  return result.data;
}

export function validateCompanionToolCall(
  input: Readonly<{
    callId: unknown;
    name: unknown;
    rawArguments: unknown;
    allowedOpenFragments: readonly AllowedOpenFragmentInput[];
    userMessages?: readonly string[];
  }>,
): CompanionToolCall {
  const callIdResult = toolCallIdSchema.safeParse(input.callId);
  if (!callIdResult.success || typeof input.name !== "string") {
    throw new CompanionError("tool_validation_failed", { cause: callIdResult.error });
  }

  switch (input.name) {
    case "recommend_fragment":
      return {
        type: "tool_call",
        callId: callIdResult.data,
        name: input.name,
        arguments: parseToolArguments(recommendFragmentArgumentsSchema, input.rawArguments),
      };
    case "open_fragment": {
      const argumentsValue = parseToolArguments(openFragmentArgumentsSchema, input.rawArguments);
      const allowedResult = z
        .array(allowedOpenFragmentSchema)
        .max(3)
        .safeParse(input.allowedOpenFragments);
      if (
        !allowedResult.success ||
        !allowedResult.data.some(({ id }) => id === argumentsValue.fragmentId)
      ) {
        throw new CompanionError("tool_validation_failed", {
          cause: allowedResult.success
            ? new Error("Fragment is not in the allowed list")
            : allowedResult.error,
        });
      }
      return {
        type: "tool_call",
        callId: callIdResult.data,
        name: input.name,
        arguments: argumentsValue,
      };
    }
    case "import_link": {
      const argumentsValue = parseToolArguments(importLinkArgumentsSchema, input.rawArguments);
      if (!isUserProvidedUrl(argumentsValue.url, input.userMessages ?? [])) {
        throw new CompanionError("tool_validation_failed", {
          cause: new Error("The imported URL was not provided by the user"),
        });
      }
      return {
        type: "tool_call",
        callId: callIdResult.data,
        name: input.name,
        arguments: argumentsValue,
      };
    }
    default:
      throw new CompanionError("tool_validation_failed", {
        cause: new Error("Unknown companion tool"),
      });
  }
}
