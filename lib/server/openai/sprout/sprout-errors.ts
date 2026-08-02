import "server-only";

import { APIConnectionTimeoutError, APIUserAbortError } from "openai";

import {
  sproutApiErrorSchema,
  type SproutApiErrorCode,
  type SproutApiResult,
} from "../../../../validation/sprout-api";
import { TextBodyLimitError, readLimitedTextBody } from "../../getnote/safe-json";

export const SPROUT_ROUTE_REQUEST_MAX_BYTES = 64 * 1024;

export const SPROUT_ERROR_MESSAGES: Readonly<Record<SproutApiErrorCode, string>> = {
  sprout_disabled: "Sprout analysis is not enabled.",
  missing_configuration: "Sprout analysis is not configured.",
  authentication_failed: "The AI service could not authenticate the request.",
  rate_limited: "The AI service is busy. Please try again later.",
  model_unavailable: "The configured AI model is unavailable.",
  request_timeout: "The AI service took too long to respond.",
  response_incomplete: "The AI service did not finish the analysis.",
  invalid_model_response: "The AI service returned an unusable analysis.",
  provider_error: "The AI service is temporarily unavailable.",
  content_too_large: "The sprout request is too large.",
  request_validation_failed: "The sprout request is invalid.",
};

const HTTP_STATUS_BY_ERROR: Readonly<Record<SproutApiErrorCode, number>> = {
  sprout_disabled: 503,
  missing_configuration: 503,
  authentication_failed: 502,
  rate_limited: 429,
  model_unavailable: 503,
  request_timeout: 504,
  response_incomplete: 502,
  invalid_model_response: 502,
  provider_error: 502,
  content_too_large: 413,
  request_validation_failed: 400,
};

export class SproutError extends Error {
  readonly code: SproutApiErrorCode;

  constructor(code: SproutApiErrorCode, options: { cause?: unknown } = {}) {
    super(SPROUT_ERROR_MESSAGES[code]);
    this.name = "SproutError";
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
  return typeof value.status === "number" ? value.status : null;
}

export function normalizeSproutProviderError(error: unknown): SproutError {
  if (error instanceof SproutError) {
    return error;
  }

  const status = getStatus(error);
  const name = getStringProperty(error, "name") ?? "";
  const providerCode = (getStringProperty(error, "code") ?? "").toLowerCase();

  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionTimeoutError" ||
    providerCode === "etimedout"
  ) {
    return new SproutError("request_timeout", { cause: error });
  }

  if (status === 401 || name === "AuthenticationError" || providerCode === "invalid_api_key") {
    return new SproutError("authentication_failed", { cause: error });
  }

  if (status === 429 || name === "RateLimitError" || providerCode === "rate_limit_exceeded") {
    return new SproutError("rate_limited", { cause: error });
  }

  if (
    status === 404 ||
    providerCode === "model_not_found" ||
    providerCode === "model_unavailable" ||
    providerCode === "model_permission_denied"
  ) {
    return new SproutError("model_unavailable", { cause: error });
  }

  return new SproutError("provider_error", { cause: error });
}

export async function readSproutRouteJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new SproutError("request_validation_failed");
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > SPROUT_ROUTE_REQUEST_MAX_BYTES
  ) {
    throw new SproutError("content_too_large");
  }

  try {
    const text = await readLimitedTextBody(request.body, SPROUT_ROUTE_REQUEST_MAX_BYTES);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof TextBodyLimitError) {
      throw new SproutError("content_too_large", { cause: error });
    }
    if (error instanceof SyntaxError) {
      throw new SproutError("request_validation_failed", { cause: error });
    }
    throw error;
  }
}

export function createSproutJsonResponse(body: SproutApiResult | unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createSproutErrorResponse(error: unknown): Response {
  const normalized = error instanceof SproutError ? error : normalizeSproutProviderError(error);
  const body = sproutApiErrorSchema.parse({
    error: {
      code: normalized.code,
      message: SPROUT_ERROR_MESSAGES[normalized.code],
    },
  });

  return createSproutJsonResponse(body, HTTP_STATUS_BY_ERROR[normalized.code]);
}
