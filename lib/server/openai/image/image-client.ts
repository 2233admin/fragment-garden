import "server-only";

import { Buffer } from "node:buffer";

import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

import {
  ImageMediaValidationError,
  type ImageBlobLike,
  type SupportedImageMimeType,
  validateImageBlob,
} from "../../../../validation/media-image";
import {
  IMAGE_ANALYSIS_MAX_OUTPUT_TOKENS,
  IMAGE_ANALYSIS_RESPONSE_FORMAT,
  imageAnalysisResultSchema,
  type ImageAnalysisResult,
} from "./image-schema";
import { ImageAnalysisError, normalizeImageProviderError } from "./image-errors";
import { buildImageAnalysisInstructions, IMAGE_ANALYSIS_USER_TEXT } from "./image-prompt";

export const OPENAI_IMAGE_ANALYSIS_TIMEOUT_MS = 45_000;

export type OpenAIImageResponsesClient = Readonly<{
  responses: Readonly<{
    create: (
      body: ResponseCreateParamsNonStreaming,
      options?: Readonly<{ signal?: AbortSignal }>,
    ) => Promise<Response>;
  }>;
}>;

export type AnalyzeImageInput = Readonly<{
  image: ImageBlobLike;
}>;

export type AnalyzeImageOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  client?: OpenAIImageResponsesClient;
  signal?: AbortSignal;
  requestId?: string;
}>;

type ImageAnalysisConfiguration = Readonly<{
  apiKey: string;
  model: string;
}>;

function readImageAnalysisConfiguration(
  environment: NodeJS.ProcessEnv,
): ImageAnalysisConfiguration {
  if (environment.OPENAI_IMAGE_ANALYSIS_ENABLED !== "true") {
    throw new ImageAnalysisError("image_analysis_disabled");
  }

  const apiKey = environment.OPENAI_API_KEY?.trim();
  const model = environment.OPENAI_IMAGE_MODEL?.trim();
  if (apiKey === undefined || apiKey.length === 0 || model === undefined || model.length === 0) {
    throw new ImageAnalysisError("missing_configuration");
  }

  return { apiKey, model };
}

export function createConfiguredImageOpenAIClient(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<{ client: OpenAI; model: string }> {
  const configuration = readImageAnalysisConfiguration(environment);
  return {
    client: new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: OPENAI_IMAGE_ANALYSIS_TIMEOUT_MS,
    }),
    model: configuration.model,
  };
}

function normalizeImageValidationError(error: unknown): ImageAnalysisError {
  if (!(error instanceof ImageMediaValidationError)) {
    return new ImageAnalysisError("invalid_image", { cause: error });
  }

  switch (error.code) {
    case "unsupported_media_type":
      return new ImageAnalysisError("unsupported_media_type", { cause: error });
    case "file_too_large":
      return new ImageAnalysisError("file_too_large", { cause: error });
    case "empty_file":
    case "invalid_dimensions":
    case "invalid_image":
      return new ImageAnalysisError("invalid_image", { cause: error });
  }
}

async function buildImageDataUrl(
  image: ImageBlobLike,
  mimeType: SupportedImageMimeType,
): Promise<string> {
  let bytes: ArrayBuffer;
  try {
    bytes = await image.arrayBuffer();
  } catch (error) {
    throw new ImageAnalysisError("invalid_image", { cause: error });
  }

  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extract the JSON text while treating provider output as untrusted data. A
 * malformed item must be classified as an invalid model response rather than
 * bubbling a TypeError into the generic provider-error bucket.
 */
function extractStructuredText(response: Response): string {
  const output = (response as unknown as Record<string, unknown>).output;
  if (!Array.isArray(output)) {
    throw new ImageAnalysisError("invalid_model_response");
  }

  const parts: string[] = [];

  for (const item of output) {
    if (!isRecord(item)) {
      throw new ImageAnalysisError("invalid_model_response");
    }
    if (item.type !== "message") {
      continue;
    }

    if (!Array.isArray(item.content)) {
      throw new ImageAnalysisError("invalid_model_response");
    }
    for (const content of item.content) {
      if (!isRecord(content) || typeof content.type !== "string") {
        throw new ImageAnalysisError("invalid_model_response");
      }
      if (content.type === "refusal") {
        throw new ImageAnalysisError("invalid_model_response");
      }
      if (content.type === "output_text") {
        if (typeof content.text !== "string") {
          throw new ImageAnalysisError("invalid_model_response");
        }
        parts.push(content.text);
      }
    }
  }

  if (parts.length > 0) {
    return parts.join("\n").trim();
  }

  const outputText = (response as unknown as Record<string, unknown>).output_text;
  if (outputText !== undefined && typeof outputText !== "string") {
    throw new ImageAnalysisError("invalid_model_response");
  }
  return outputText?.trim() ?? "";
}

function parseImageAnalysisResponse(response: Response): ImageAnalysisResult {
  if (!isRecord(response)) {
    throw new ImageAnalysisError("invalid_model_response");
  }

  if (response.status === "incomplete") {
    throw new ImageAnalysisError("response_incomplete");
  }
  if (response.status !== "completed") {
    throw new ImageAnalysisError("provider_error");
  }

  const text = extractStructuredText(response);
  if (text.length === 0) {
    throw new ImageAnalysisError("invalid_model_response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch (error) {
    throw new ImageAnalysisError("invalid_model_response", { cause: error });
  }

  const result = imageAnalysisResultSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new ImageAnalysisError("invalid_model_response", { cause: result.error });
  }
  return result.data;
}

function getImageSizeRange(sizeBytes: number): string {
  if (sizeBytes <= 256 * 1024) {
    return "0-256KB";
  }
  if (sizeBytes <= 1024 * 1024) {
    return "256KB-1MB";
  }
  if (sizeBytes <= 5 * 1024 * 1024) {
    return "1-5MB";
  }
  return "5-10MB";
}

function logImageProviderResponse(
  response: Response,
  requestId: string,
  durationMs: number,
  mediaType: SupportedImageMimeType,
  sizeBytes: number,
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
  const safeRequestId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(requestId)
      ? requestId
      : null;

  console.info("image_analysis_provider_response", {
    requestId: safeRequestId,
    mediaType,
    fileSizeRange: getImageSizeRange(sizeBytes),
    providerStatus: responseStatus,
    durationMs: Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
  });
}

export async function analyzeImage(
  input: AnalyzeImageInput,
  options: AnalyzeImageOptions = {},
): Promise<ImageAnalysisResult> {
  const environment = options.environment ?? process.env;
  const configuration = readImageAnalysisConfiguration(environment);
  const client =
    options.client ??
    new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: OPENAI_IMAGE_ANALYSIS_TIMEOUT_MS,
    });

  let validatedImage: Awaited<ReturnType<typeof validateImageBlob>>;
  try {
    validatedImage = await validateImageBlob(input.image);
  } catch (error) {
    throw normalizeImageValidationError(error);
  }

  const imageDataUrl = await buildImageDataUrl(input.image, validatedImage.mimeType);
  const request: ResponseCreateParamsNonStreaming = {
    model: configuration.model,
    instructions: buildImageAnalysisInstructions(),
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: IMAGE_ANALYSIS_USER_TEXT },
          { type: "input_image", image_url: imageDataUrl, detail: "auto" },
        ],
      },
    ],
    text: { format: IMAGE_ANALYSIS_RESPONSE_FORMAT },
    max_output_tokens: IMAGE_ANALYSIS_MAX_OUTPUT_TOKENS,
    store: false,
  };

  let response: Response;
  const providerStartedAt = performance.now();
  try {
    response = await client.responses.create(request, { signal: options.signal });
  } catch (error) {
    throw normalizeImageProviderError(error);
  }

  if (options.requestId !== undefined) {
    logImageProviderResponse(
      response,
      options.requestId,
      Math.round(performance.now() - providerStartedAt),
      validatedImage.mimeType,
      validatedImage.sizeBytes,
    );
  }

  return parseImageAnalysisResponse(response);
}
