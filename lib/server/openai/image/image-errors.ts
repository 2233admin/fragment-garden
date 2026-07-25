import "server-only";

import { APIConnectionTimeoutError, APIUserAbortError } from "openai";
import { z } from "zod";

import {
  imageAnalysisApiErrorResponseSchema,
  type ImageAnalysisApiErrorCode,
} from "./image-schema";

export const IMAGE_ROUTE_REQUEST_MAX_BYTES = 10 * 1024 * 1024 + 64 * 1024;

export const IMAGE_ANALYSIS_ERROR_MESSAGES: Readonly<Record<ImageAnalysisApiErrorCode, string>> = {
  invalid_request: "The image analysis request is invalid.",
  image_analysis_disabled: "Image analysis is not enabled.",
  missing_configuration: "Image analysis is not configured.",
  unsupported_media_type: "Only PNG, JPEG, and WebP images are supported.",
  file_too_large: "The image file is too large.",
  invalid_image: "The image could not be read.",
  authentication_failed: "The AI service could not authenticate the image request.",
  rate_limited: "The AI service is busy. Please try again later.",
  model_unavailable: "The configured image model is unavailable.",
  request_timeout: "The image analysis took too long to finish.",
  request_interrupted: "The previous image analysis did not finish.",
  response_incomplete: "The AI service did not finish the image analysis.",
  invalid_model_response: "The AI service returned an unusable image analysis.",
  provider_error: "The image analysis service is temporarily unavailable.",
};

const HTTP_STATUS_BY_ERROR: Readonly<Record<ImageAnalysisApiErrorCode, number>> = {
  invalid_request: 400,
  image_analysis_disabled: 503,
  missing_configuration: 503,
  unsupported_media_type: 415,
  file_too_large: 413,
  invalid_image: 400,
  authentication_failed: 502,
  rate_limited: 429,
  model_unavailable: 503,
  request_timeout: 504,
  request_interrupted: 502,
  response_incomplete: 502,
  invalid_model_response: 502,
  provider_error: 502,
};

export class ImageAnalysisError extends Error {
  readonly code: ImageAnalysisApiErrorCode;

  constructor(code: ImageAnalysisApiErrorCode, options: { cause?: unknown } = {}) {
    super(IMAGE_ANALYSIS_ERROR_MESSAGES[code]);
    this.name = "ImageAnalysisError";
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringProperty(value: unknown, property: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const propertyValue = value[property];
  return typeof propertyValue === "string" ? propertyValue : null;
}

function getStatus(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = value.status;
  return typeof status === "number" ? status : null;
}

/** Reduce provider failures to a stable public vocabulary. */
export function normalizeImageProviderError(error: unknown): ImageAnalysisError {
  if (error instanceof ImageAnalysisError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new ImageAnalysisError("invalid_model_response", { cause: error });
  }

  const status = getStatus(error);
  const name = getStringProperty(error, "name") ?? "";
  const providerCode = (getStringProperty(error, "code") ?? "").toLowerCase();
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const combined = `${name} ${providerCode} ${message}`.toLowerCase();

  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionTimeoutError" ||
    providerCode === "etimedout" ||
    combined.includes("timeout")
  ) {
    return new ImageAnalysisError("request_timeout", { cause: error });
  }

  if (
    status === 401 ||
    name === "AuthenticationError" ||
    providerCode === "invalid_api_key" ||
    combined.includes("authentication")
  ) {
    return new ImageAnalysisError("authentication_failed", { cause: error });
  }

  if (status === 429 || name === "RateLimitError" || combined.includes("rate_limit")) {
    return new ImageAnalysisError("rate_limited", { cause: error });
  }

  if (
    status === 404 ||
    providerCode === "model_not_found" ||
    providerCode === "model_unavailable" ||
    providerCode === "model_permission_denied" ||
    combined.includes("model unavailable") ||
    (combined.includes("model") &&
      (combined.includes("does not exist") ||
        combined.includes("not found") ||
        combined.includes("no access") ||
        combined.includes("do not have access")))
  ) {
    return new ImageAnalysisError("model_unavailable", { cause: error });
  }

  return new ImageAnalysisError("provider_error", { cause: error });
}

export function createImageJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createImageErrorResponse(error: unknown, requestId: string | null): Response {
  const normalized =
    error instanceof ImageAnalysisError ? error : normalizeImageProviderError(error);
  const body = imageAnalysisApiErrorResponseSchema.parse({
    error: {
      code: normalized.code,
      message: IMAGE_ANALYSIS_ERROR_MESSAGES[normalized.code],
      requestId,
    },
  });

  return createImageJsonResponse(body, HTTP_STATUS_BY_ERROR[normalized.code]);
}
