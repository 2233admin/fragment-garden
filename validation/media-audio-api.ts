import { z } from "zod";

import { AUDIO_TRANSCRIPT_MAX_CHARACTERS, normalizeAudioTranscript } from "./media-audio";

function transcriptSchema() {
  return z
    .string()
    .transform((value, context) => {
      try {
        return normalizeAudioTranscript(value);
      } catch {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid transcription" });
        return z.NEVER;
      }
    })
    .refine((value) => Array.from(value).length <= AUDIO_TRANSCRIPT_MAX_CHARACTERS);
}

export const audioTranscriptionResultSchema = z.object({ transcript: transcriptSchema() }).strict();

export type AudioTranscriptionResult = z.infer<typeof audioTranscriptionResultSchema>;

export const audioClientRequestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const audioTranscriptionApiResultSchema = z
  .object({
    requestId: z.string().uuid(),
    clientRequestId: audioClientRequestIdSchema,
    transcription: audioTranscriptionResultSchema,
  })
  .strict();

export type AudioTranscriptionApiResult = z.infer<typeof audioTranscriptionApiResultSchema>;

export const audioTranscriptionApiErrorCodeSchema = z.enum([
  "invalid_request",
  "transcription_disabled",
  "missing_configuration",
  "microphone_permission_denied",
  "microphone_unavailable",
  "recording_unsupported",
  "recording_failed",
  "empty_recording",
  "unsupported_media_type",
  "file_too_large",
  "authentication_failed",
  "rate_limited",
  "model_unavailable",
  "request_timeout",
  "request_interrupted",
  "invalid_transcription",
  "provider_error",
]);

export type AudioTranscriptionApiErrorCode = z.infer<typeof audioTranscriptionApiErrorCodeSchema>;

export const audioTranscriptionApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: audioTranscriptionApiErrorCodeSchema,
        message: z.string().trim().min(1).max(500),
        requestId: z.string().uuid().nullable(),
      })
      .strict(),
  })
  .strict();
