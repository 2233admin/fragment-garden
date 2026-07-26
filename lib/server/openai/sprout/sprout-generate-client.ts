import "server-only";

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

import {
  sproutGenerateRequestSchema,
  sproutGeneratedNoteSchema,
  type SproutGenerateRequest,
  type SproutGeneratedNote,
} from "../../../../validation/sprout-generate-api";
import { normalizeSproutProviderError, SproutError } from "./sprout-errors";
import { buildSproutGenerateProviderInput } from "./sprout-generate-context";
import { buildSproutGenerateInstructions } from "./sprout-generate-prompt";
import { SPROUT_GENERATE_RESPONSE_FORMAT } from "./sprout-generate-schema";

export const OPENAI_SPROUT_GENERATE_TIMEOUT_MS = 45_000;
export const OPENAI_SPROUT_GENERATE_MAX_OUTPUT_TOKENS = 2_500;

export type OpenAISproutGenerateResponsesClient = Readonly<{
  responses: Readonly<{
    create: (
      body: ResponseCreateParamsNonStreaming,
      options?: Readonly<{ signal?: AbortSignal }>,
    ) => Promise<Response>;
  }>;
}>;

export type GenerateSproutNoteOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  client?: OpenAISproutGenerateResponsesClient;
  signal?: AbortSignal;
  requestId?: string;
}>;

function readConfiguration(
  environment: NodeJS.ProcessEnv,
): Readonly<{ apiKey: string; model: string }> {
  if (environment.OPENAI_SPROUT_ENABLED !== "true") {
    throw new SproutError("sprout_disabled");
  }
  const apiKey = environment.OPENAI_API_KEY?.trim();
  const model = environment.OPENAI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new SproutError("missing_configuration");
  }
  return { apiKey, model };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractStructuredText(response: Response): string {
  const rawOutput = (response as unknown as Record<string, unknown>).output;
  if (!Array.isArray(rawOutput)) {
    throw new SproutError("invalid_model_response");
  }

  const parts: string[] = [];
  for (const item of rawOutput) {
    if (!isRecord(item)) throw new SproutError("invalid_model_response");
    if (item.type !== "message") continue;
    if (!Array.isArray(item.content)) throw new SproutError("invalid_model_response");
    for (const content of item.content) {
      if (!isRecord(content) || typeof content.type !== "string") {
        throw new SproutError("invalid_model_response");
      }
      if (content.type === "refusal") throw new SproutError("invalid_model_response");
      if (content.type === "output_text") {
        if (typeof content.text !== "string") throw new SproutError("invalid_model_response");
        parts.push(content.text);
      }
    }
  }
  if (parts.length > 0) return parts.join("\n").trim();

  const outputText = (response as unknown as Record<string, unknown>).output_text;
  if (outputText !== undefined && typeof outputText !== "string") {
    throw new SproutError("invalid_model_response");
  }
  return outputText?.trim() ?? "";
}

function parseResponse(response: Response): SproutGeneratedNote {
  if (!isRecord(response)) throw new SproutError("invalid_model_response");
  if (response.status === "incomplete") throw new SproutError("response_incomplete");
  if (response.status !== "completed") throw new SproutError("provider_error");

  const text = extractStructuredText(response);
  if (text.length === 0) throw new SproutError("invalid_model_response");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new SproutError("invalid_model_response", { cause: error });
  }
  const result = sproutGeneratedNoteSchema.safeParse(json);
  if (!result.success) {
    throw new SproutError("invalid_model_response", { cause: result.error });
  }
  return result.data;
}

export async function generateSproutNote(
  input: SproutGenerateRequest,
  options: GenerateSproutNoteOptions = {},
): Promise<SproutGeneratedNote> {
  const parsedInput = sproutGenerateRequestSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new SproutError("request_validation_failed", { cause: parsedInput.error });
  }

  const configuration = readConfiguration(options.environment ?? process.env);
  const client =
    options.client ??
    new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: OPENAI_SPROUT_GENERATE_TIMEOUT_MS,
    });
  const request: ResponseCreateParamsNonStreaming = {
    model: configuration.model,
    instructions: buildSproutGenerateInstructions(),
    input: buildSproutGenerateProviderInput(parsedInput.data),
    text: { format: SPROUT_GENERATE_RESPONSE_FORMAT },
    max_output_tokens: OPENAI_SPROUT_GENERATE_MAX_OUTPUT_TOKENS,
    store: false,
  };

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await client.responses.create(request, { signal: options.signal });
  } catch (error) {
    throw normalizeSproutProviderError(error);
  }

  if (options.requestId !== undefined) {
    console.info("sprout_generate_provider_response", {
      requestId: /^[0-9a-f-]{36}$/iu.test(options.requestId) ? options.requestId : null,
      providerStatus: typeof response.status === "string" ? response.status : null,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
  }
  return parseResponse(response);
}
