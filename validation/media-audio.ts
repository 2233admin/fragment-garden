/** Shared validation for locally recorded audio and provider transcription text. */

export const AUDIO_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export const AUDIO_MAX_DURATION_MS = 3 * 60 * 1000;
export const AUDIO_TRANSCRIPT_MAX_CHARACTERS = 12_000;
export const AUDIO_TITLE_MAX_CHARACTERS = 40;

/** Canonical MIME types used by the media model and transcription Route. */
export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
] as const;
export type SupportedAudioMimeType = (typeof AUDIO_MIME_TYPES)[number];

export type AudioMediaValidationErrorCode =
  | "empty_recording"
  | "unsupported_media_type"
  | "file_too_large"
  | "invalid_duration"
  | "recording_too_long"
  | "invalid_transcription";

export class AudioMediaValidationError extends Error {
  readonly code: AudioMediaValidationErrorCode;

  constructor(code: AudioMediaValidationErrorCode, message: string) {
    super(message);
    this.name = "AudioMediaValidationError";
    this.code = code;
  }
}

export type AudioMediaMetadataInput = Readonly<{
  mimeType: string;
  sizeBytes: number;
  durationMs?: number | null;
}>;

export type ValidatedAudioMediaMetadata = Readonly<{
  mimeType: SupportedAudioMimeType;
  sizeBytes: number;
  durationMs: number | null;
}>;

const MIME_ALIASES: Readonly<Record<string, SupportedAudioMimeType>> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/ogg;codecs=opus": "audio/ogg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-mp3": "audio/mpeg",
  "audio/x-mpeg": "audio/mpeg",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
};

function isSupportedAudioMimeType(value: string): value is SupportedAudioMimeType {
  return (AUDIO_MIME_TYPES as readonly string[]).includes(value);
}

/** Strip optional codec parameters and normalize common browser aliases. */
export function normalizeAudioMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  const baseType = normalized.split(";", 1)[0]?.trim() ?? "";
  return MIME_ALIASES[normalized] ?? MIME_ALIASES[baseType] ?? baseType;
}

export function validateAudioMediaMetadata(
  input: AudioMediaMetadataInput,
): ValidatedAudioMediaMetadata {
  if (typeof input.mimeType !== "string") {
    throw new AudioMediaValidationError("unsupported_media_type", "An audio MIME type is required");
  }

  const mimeType = normalizeAudioMimeType(input.mimeType);
  if (!isSupportedAudioMimeType(mimeType)) {
    throw new AudioMediaValidationError(
      "unsupported_media_type",
      "This audio format is not supported",
    );
  }

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new AudioMediaValidationError("empty_recording", "The recording is empty");
  }
  if (input.sizeBytes > AUDIO_MAX_SIZE_BYTES) {
    throw new AudioMediaValidationError("file_too_large", "The recording is too large");
  }

  const durationMs = input.durationMs ?? null;
  if (durationMs !== null && (!Number.isSafeInteger(durationMs) || durationMs < 0)) {
    throw new AudioMediaValidationError("invalid_duration", "The recording duration is invalid");
  }
  if (durationMs !== null && durationMs > AUDIO_MAX_DURATION_MS) {
    throw new AudioMediaValidationError("recording_too_long", "The recording is too long");
  }

  return { mimeType, sizeBytes: input.sizeBytes, durationMs };
}

function stripUnsafeControls(value: string): string {
  return value
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "");
}

/** Normalize provider/user text while preserving ordinary line breaks. */
export function normalizeAudioTranscript(value: string): string {
  if (typeof value !== "string") {
    throw new AudioMediaValidationError("invalid_transcription", "The transcription is invalid");
  }

  const normalized = stripUnsafeControls(value).trim();
  if (normalized.length === 0) {
    throw new AudioMediaValidationError("invalid_transcription", "The transcription is empty");
  }
  if (Array.from(normalized).length > AUDIO_TRANSCRIPT_MAX_CHARACTERS) {
    throw new AudioMediaValidationError("invalid_transcription", "The transcription is too long");
  }
  return normalized;
}

/** Return a deterministic local title candidate from the first transcript sentence. */
export function deriveAudioTitleFromTranscript(transcript: string): string | null {
  let normalized: string;
  try {
    normalized = normalizeAudioTranscript(transcript);
  } catch {
    return null;
  }

  const firstSentence = normalized.split(/[\n.!?。！？]/u, 1)[0] ?? "";
  const withoutEdgePunctuation = firstSentence
    .replace(/^[\p{P}\p{S}\s]+/gu, "")
    .replace(/[\p{P}\p{S}\s]+$/gu, "")
    .trim();
  const title = Array.from(withoutEdgePunctuation)
    .slice(0, AUDIO_TITLE_MAX_CHARACTERS)
    .join("")
    .trim();
  return title.length === 0 ? null : title;
}
