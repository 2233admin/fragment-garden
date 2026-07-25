import "server-only";

import { APIConnectionTimeoutError, APIUserAbortError } from "openai";
import { z } from "zod";

import {
  audioTranscriptionApiErrorResponseSchema,
  type AudioTranscriptionApiErrorCode,
} from "./audio-schema";

/** The audio bytes are capped before multipart parsing; the remainder is envelope overhead. */
export const AUDIO_ROUTE_REQUEST_MAX_BYTES = 15 * 1024 * 1024 + 64 * 1024;

export const AUDIO_TRANSCRIPTION_ERROR_MESSAGES: Readonly<
  Record<AudioTranscriptionApiErrorCode, string>
> = {
  invalid_request: "The audio transcription request is invalid.",
  transcription_disabled: "Audio transcription is not enabled.",
  missing_configuration: "Audio transcription is not configured.",
  microphone_permission_denied: "Microphone permission was denied.",
  microphone_unavailable: "The microphone is unavailable.",
  recording_unsupported: "Audio recording is not supported.",
  recording_failed: "The audio recording failed.",
  empty_recording: "The audio recording is empty.",
  unsupported_media_type: "This audio format is not supported.",
  file_too_large: "The audio file is too large.",
  authentication_failed: "The AI service could not authenticate the audio request.",
  rate_limited: "The AI service is busy. Please try again later.",
  model_unavailable: "The configured transcription model is unavailable.",
  request_timeout: "The audio transcription took too long to finish.",
  request_interrupted: "The previous audio transcription did not finish.",
  invalid_transcription: "The AI service returned an unusable transcription.",
  provider_error: "The audio transcription service is temporarily unavailable.",
};

const HTTP_STATUS_BY_ERROR: Readonly<Record<AudioTranscriptionApiErrorCode, number>> = {
  invalid_request: 400,
  transcription_disabled: 503,
  missing_configuration: 503,
  microphone_permission_denied: 400,
  microphone_unavailable: 400,
  recording_unsupported: 400,
  recording_failed: 400,
  empty_recording: 400,
  unsupported_media_type: 415,
  file_too_large: 413,
  authentication_failed: 502,
  rate_limited: 429,
  model_unavailable: 503,
  request_timeout: 504,
  request_interrupted: 502,
  invalid_transcription: 502,
  provider_error: 502,
};

export class AudioTranscriptionError extends Error {
  readonly code: AudioTranscriptionApiErrorCode;

  constructor(code: AudioTranscriptionApiErrorCode, options: { cause?: unknown } = {}) {
    super(AUDIO_TRANSCRIPTION_ERROR_MESSAGES[code]);
    this.name = "AudioTranscriptionError";
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
  if (!isRecord(value)) return null;
  const propertyValue = value[property];
  return typeof propertyValue === "string" ? propertyValue : null;
}

function getStatus(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  return typeof status === "number" ? status : null;
}

/** Reduce provider failures to a stable public vocabulary without exposing provider details. */
export function normalizeAudioProviderError(error: unknown): AudioTranscriptionError {
  if (error instanceof AudioTranscriptionError) return error;
  if (error instanceof z.ZodError) {
    return new AudioTranscriptionError("invalid_transcription", { cause: error });
  }

  const status = getStatus(error);
  const name = getStringProperty(error, "name") ?? "";
  const providerCode = (getStringProperty(error, "code") ?? "").toLowerCase();
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const combined = `${name} ${providerCode} ${message}`;

  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIUserAbortError ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIConnectionTimeoutError" ||
    providerCode === "etimedout" ||
    combined.includes("timeout")
  ) {
    return new AudioTranscriptionError("request_timeout", { cause: error });
  }

  if (
    status === 401 ||
    name === "AuthenticationError" ||
    providerCode === "invalid_api_key" ||
    combined.includes("authentication")
  ) {
    return new AudioTranscriptionError("authentication_failed", { cause: error });
  }

  if (status === 429 || name === "RateLimitError" || combined.includes("rate_limit")) {
    return new AudioTranscriptionError("rate_limited", { cause: error });
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
    return new AudioTranscriptionError("model_unavailable", { cause: error });
  }

  return new AudioTranscriptionError("provider_error", { cause: error });
}

export function createAudioJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function createAudioErrorResponse(error: unknown, requestId: string | null): Response {
  const normalized =
    error instanceof AudioTranscriptionError ? error : normalizeAudioProviderError(error);
  const body = audioTranscriptionApiErrorResponseSchema.parse({
    error: {
      code: normalized.code,
      message: AUDIO_TRANSCRIPTION_ERROR_MESSAGES[normalized.code],
      requestId,
    },
  });
  return createAudioJsonResponse(body, HTTP_STATUS_BY_ERROR[normalized.code]);
}
