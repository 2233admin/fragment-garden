import "server-only";

import { z } from "zod";

import { companionErrorResponseSchema, type CompanionApiResult } from "./companion-schemas";
import { TextBodyLimitError, readLimitedTextBody } from "../getnote/safe-json";

export const COMPANION_ROUTE_REQUEST_MAX_BYTES = 64 * 1024;

export const COMPANION_ERROR_MESSAGES = {
  invalid_request: "The companion request is invalid.",
  openai_disabled: "AI mode is not enabled.",
  missing_configuration: "The AI service is not configured.",
  authentication_failed: "The AI service could not authenticate the request.",
  rate_limited: "The AI service is busy. Please try again later.",
  model_unavailable: "The configured AI model is unavailable.",
  request_timeout: "The AI service took too long to respond.",
  invalid_model_response: "The AI service returned an unusable response.",
  provider_error: "The AI service is temporarily unavailable.",
  tool_validation_failed: "The requested companion action was not valid.",
} as const;

export type CompanionErrorCode = keyof typeof COMPANION_ERROR_MESSAGES;

const HTTP_STATUS_BY_ERROR: Readonly<Record<CompanionErrorCode, number>> = {
  invalid_request: 400,
  openai_disabled: 503,
  missing_configuration: 503,
  authentication_failed: 502,
  rate_limited: 429,
  model_unavailable: 503,
  request_timeout: 504,
  invalid_model_response: 502,
  provider_error: 502,
  tool_validation_failed: 502,
};

export class CompanionError extends Error {
  readonly code: CompanionErrorCode;

  constructor(code: CompanionErrorCode, options: { cause?: unknown } = {}) {
    super(COMPANION_ERROR_MESSAGES[code]);
    this.name = "CompanionError";
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

/**
 * Provider errors are intentionally reduced to a small public vocabulary. The
 * original SDK error is retained only as an internal cause and is never sent to
 * the browser.
 */
export function toCompanionError(error: unknown): CompanionError {
  if (error instanceof CompanionError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new CompanionError("invalid_request", { cause: error });
  }

  const status = getStatus(error);
  const name = getStringProperty(error, "name") ?? "";
  const providerCode = getStringProperty(error, "code") ?? "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const combinedCode = `${name} ${providerCode} ${message}`.toLowerCase();

  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionTimeoutError" ||
    combinedCode.includes("timeout")
  ) {
    return new CompanionError("request_timeout", { cause: error });
  }

  if (status === 401 || name === "AuthenticationError" || combinedCode.includes("authentication")) {
    return new CompanionError("authentication_failed", { cause: error });
  }

  if (status === 429 || name === "RateLimitError" || combinedCode.includes("rate_limit")) {
    return new CompanionError("rate_limited", { cause: error });
  }

  if (
    status === 404 ||
    combinedCode.includes("model_not_found") ||
    combinedCode.includes("model unavailable") ||
    combinedCode.includes("model_unavailable") ||
    (combinedCode.includes("model") &&
      (combinedCode.includes("does not exist") ||
        combinedCode.includes("not found") ||
        combinedCode.includes("no access") ||
        combinedCode.includes("do not have access")))
  ) {
    return new CompanionError("model_unavailable", { cause: error });
  }

  return new CompanionError("provider_error", { cause: error });
}

export async function readCompanionRouteJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new CompanionError("invalid_request");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > COMPANION_ROUTE_REQUEST_MAX_BYTES) {
    throw new CompanionError("invalid_request");
  }

  try {
    const text = await readLimitedTextBody(request.body, COMPANION_ROUTE_REQUEST_MAX_BYTES);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof TextBodyLimitError || error instanceof SyntaxError) {
      throw new CompanionError("invalid_request", { cause: error });
    }
    throw error;
  }
}

export function createCompanionJsonResponse(
  body: CompanionApiResult | unknown,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createCompanionErrorResponse(error: unknown): Response {
  const normalized = toCompanionError(error);
  const body = companionErrorResponseSchema.parse({
    error: {
      code: normalized.code,
      message: COMPANION_ERROR_MESSAGES[normalized.code],
    },
  });

  return createCompanionJsonResponse(body, HTTP_STATUS_BY_ERROR[normalized.code]);
}
