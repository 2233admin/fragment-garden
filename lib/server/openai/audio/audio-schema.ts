import "server-only";

export {
  audioClientRequestIdSchema,
  audioTranscriptionApiErrorCodeSchema,
  audioTranscriptionApiErrorResponseSchema,
  audioTranscriptionApiResultSchema,
  audioTranscriptionResultSchema,
} from "../../../../validation/media-audio-api";
export type {
  AudioTranscriptionApiErrorCode,
  AudioTranscriptionApiResult,
  AudioTranscriptionResult,
} from "../../../../validation/media-audio-api";

export const AUDIO_TRANSCRIPTION_RESPONSE_FORMAT = "json" as const;
export const AUDIO_TRANSCRIPTION_TIMEOUT_MS = 45_000;
