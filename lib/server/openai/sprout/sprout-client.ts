import "server-only";

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

import { isSproutRecommendedActionAllowed } from "../../../../domain/sprout/recommended-actions";
import {
  sproutAnalyzeRequestSchema,
  sproutApiResultSchema,
  type SproutAnalyzeRequest,
  type SproutApiResult,
} from "../../../../validation/sprout-api";
import { buildSproutProviderInput } from "./sprout-context";
import { normalizeSproutProviderError, SproutError } from "./sprout-errors";
import { buildSproutInstructions } from "./sprout-prompt";
import { SPROUT_RESPONSE_FORMAT, sproutProviderEnvelopeSchema } from "./sprout-schema";

export const OPENAI_SPROUT_TIMEOUT_MS = 45_000;
export const OPENAI_SPROUT_MAX_OUTPUT_TOKENS = 700;

export type OpenAISproutResponsesClient = Readonly<{
  responses: Readonly<{
    create: (
      body: ResponseCreateParamsNonStreaming,
      options?: Readonly<{ signal?: AbortSignal }>,
    ) => Promise<Response>;
  }>;
}>;

export type AnalyzeSproutOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  client?: OpenAISproutResponsesClient;
  signal?: AbortSignal;
  requestId?: string;
}>;

type SproutConfiguration = Readonly<{
  apiKey: string;
  model: string;
}>;

function readSproutConfiguration(environment: NodeJS.ProcessEnv): SproutConfiguration {
  if (environment.OPENAI_SPROUT_ENABLED !== "true") {
    throw new SproutError("sprout_disabled");
  }

  const apiKey = environment.OPENAI_API_KEY?.trim();
  const model = environment.OPENAI_MODEL?.trim();
  if (apiKey === undefined || apiKey.length === 0 || model === undefined || model.length === 0) {
    throw new SproutError("missing_configuration");
  }

  return { apiKey, model };
}

export function createConfiguredSproutOpenAIClient(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<{ client: OpenAI; model: string }> {
  const configuration = readSproutConfiguration(environment);
  return {
    client: new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: OPENAI_SPROUT_TIMEOUT_MS,
    }),
    model: configuration.model,
  };
}

function extractStructuredText(response: Response): string {
  const parts: string[] = [];

  for (const item of response.output) {
    if (item.type !== "message") {
      continue;
    }
    for (const content of item.content) {
      if (content.type === "refusal") {
        throw new SproutError("invalid_model_response");
      }
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  if (parts.length > 0) {
    return parts.join("\n").trim();
  }

  const outputText = (response as unknown as Record<string, unknown>).output_text;
  return typeof outputText === "string" ? outputText.trim() : "";
}

function logSproutProviderResponse(
  response: Response,
  requestId: string,
  durationMs: number,
): void {
  const responseStatuses = new Set([
    "cancelled",
    "completed",
    "failed",
    "in_progress",
    "incomplete",
    "queued",
  ]);
  const responseStatus =
    typeof response.status === "string" && responseStatuses.has(response.status)
      ? response.status
      : null;
  const incompleteReason =
    response.incomplete_details?.reason === "max_output_tokens" ||
    response.incomplete_details?.reason === "content_filter"
      ? response.incomplete_details.reason
      : null;
  const rawOutput = (response as unknown as { output?: unknown }).output;
  const outputItemTypes = Array.isArray(rawOutput)
    ? rawOutput.slice(0, 32).map((item) => {
        if (typeof item !== "object" || item === null) {
          return "unknown";
        }
        const type = (item as Record<string, unknown>).type;
        return typeof type === "string" && /^[a-z0-9_]{1,64}$/.test(type) ? type : "unknown";
      })
    : [];
  const nonNegativeIntegerOrNull = (value: unknown): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const responseModel = (response as unknown as { model?: unknown }).model;
  const safeModel =
    typeof responseModel === "string" && /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(responseModel)
      ? responseModel
      : null;
  const safeRequestId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
      ? requestId
      : null;

  console.info("sprout_provider_response", {
    model: safeModel,
    responseStatus,
    incompleteReason,
    inputTokens: nonNegativeIntegerOrNull(response.usage?.input_tokens),
    outputTokens: nonNegativeIntegerOrNull(response.usage?.output_tokens),
    reasoningTokens: nonNegativeIntegerOrNull(
      response.usage?.output_tokens_details?.reasoning_tokens,
    ),
    outputItemTypes,
    hasOutputText:
      typeof response.output_text === "string" && response.output_text.trim().length > 0,
    requestId: safeRequestId,
    durationMs: nonNegativeIntegerOrNull(durationMs),
  });
}

function parseSproutResponse(response: Response, input: SproutAnalyzeRequest): SproutApiResult {
  if (response.status === "incomplete") {
    throw new SproutError("response_incomplete");
  }
  if (response.status !== "completed" || !Array.isArray(response.output)) {
    throw new SproutError("provider_error");
  }

  const text = extractStructuredText(response);
  if (text.length === 0) {
    throw new SproutError("invalid_model_response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    throw new SproutError("invalid_model_response", { cause: error });
  }

  const providerResult = sproutProviderEnvelopeSchema.safeParse(parsedJson);
  if (!providerResult.success) {
    throw new SproutError("invalid_model_response", { cause: providerResult.error });
  }

  const result = providerResult.data.result;
  if (result.type === "insufficient_content") {
    return { type: "insufficient_content" };
  }

  if (
    !isSproutRecommendedActionAllowed(result.recommendedAction, {
      completionStatus: input.fragment.isCompleted ? "completed" : "open",
      lifecycleStatus: input.fragment.lifecycleStatus,
    })
  ) {
    throw new SproutError("invalid_model_response");
  }

  const publicResult = sproutApiResultSchema.safeParse(result);
  if (!publicResult.success) {
    throw new SproutError("invalid_model_response", { cause: publicResult.error });
  }
  return publicResult.data;
}

export async function analyzeSprout(
  input: SproutAnalyzeRequest,
  options: AnalyzeSproutOptions = {},
): Promise<SproutApiResult> {
  const parsedInput = sproutAnalyzeRequestSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new SproutError("request_validation_failed", { cause: parsedInput.error });
  }

  const environment = options.environment ?? process.env;
  const configuration = readSproutConfiguration(environment);
  const client =
    options.client ??
    new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: OPENAI_SPROUT_TIMEOUT_MS,
    });
  const providerInput = buildSproutProviderInput(parsedInput.data);
  const request: ResponseCreateParamsNonStreaming = {
    model: configuration.model,
    instructions: buildSproutInstructions(),
    input: providerInput.input,
    text: { format: SPROUT_RESPONSE_FORMAT },
    max_output_tokens: OPENAI_SPROUT_MAX_OUTPUT_TOKENS,
    store: false,
  };

  let response: Response;
  const providerStartedAt = performance.now();
  try {
    response = await client.responses.create(request, { signal: options.signal });
  } catch (error) {
    throw normalizeSproutProviderError(error);
  }

  if (options.requestId !== undefined) {
    logSproutProviderResponse(
      response,
      options.requestId,
      Math.round(performance.now() - providerStartedAt),
    );
  }

  return parseSproutResponse(response, providerInput.context);
}
