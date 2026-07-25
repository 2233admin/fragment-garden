import { AudioMediaValidationError, validateAudioMediaMetadata } from "../validation/media-audio";
import {
  audioTranscriptionApiErrorResponseSchema,
  audioTranscriptionApiResultSchema,
  type AudioTranscriptionApiErrorCode,
  type AudioTranscriptionApiResult,
} from "../validation/media-audio-api";

/** Client-facing error with the transcription Route's normalized vocabulary. */
export class AudioMediaApiClientError extends Error {
  readonly code: AudioTranscriptionApiErrorCode;

  constructor(code: AudioTranscriptionApiErrorCode, message: string) {
    super(message);
    this.name = "AudioMediaApiClientError";
    this.code = code;
  }
}

function fallbackCode(status: number): AudioTranscriptionApiErrorCode {
  if (status === 413) return "file_too_large";
  if (status === 415) return "unsupported_media_type";
  if (status === 429) return "rate_limited";
  return status === 400 ? "invalid_request" : "provider_error";
}

function messageFor(code: AudioTranscriptionApiErrorCode): string {
  switch (code) {
    case "transcription_disabled":
      return "Audio transcription is not enabled. The original recording remains local.";
    case "missing_configuration":
      return "Audio transcription is not configured. The original recording remains local.";
    case "file_too_large":
      return "The recording is larger than 15 MB. The original recording remains local.";
    case "unsupported_media_type":
      return "This recording format is not supported. The original recording remains local.";
    case "request_timeout":
      return "Audio transcription timed out. The original recording remains local.";
    case "request_interrupted":
      return "The previous transcription did not finish. The original recording remains local.";
    case "invalid_transcription":
      return "The transcription response was not usable. The original recording remains local.";
    case "rate_limited":
      return "The transcription service is busy. Please try again later.";
    default:
      return "Audio transcription failed. The original recording remains local; please try again.";
  }
}

function mapValidationError(error: AudioMediaValidationError): AudioTranscriptionApiErrorCode {
  switch (error.code) {
    case "empty_recording":
      return "empty_recording";
    case "unsupported_media_type":
      return "unsupported_media_type";
    case "file_too_large":
    case "recording_too_long":
      return "file_too_large";
    case "invalid_duration":
    case "invalid_transcription":
      return "invalid_request";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AudioMediaApiClientError("provider_error", messageFor("provider_error"));
  }
}

export async function transcribeAudioMedia(
  file: Blob,
  clientRequestId: string,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<AudioTranscriptionApiResult> {
  try {
    validateAudioMediaMetadata({ mimeType: file.type, sizeBytes: file.size });
  } catch (error) {
    if (error instanceof AudioMediaValidationError) {
      const code = mapValidationError(error);
      throw new AudioMediaApiClientError(code, messageFor(code));
    }
    throw error;
  }

  const formData = new FormData();
  const fallbackName = file.type.includes("ogg")
    ? "recording.ogg"
    : file.type.includes("wav")
      ? "recording.wav"
      : file.type.includes("mpeg") || file.type.includes("mp3")
        ? "recording.mp3"
        : file.type.includes("mp4") || file.type.includes("m4a")
          ? "recording.m4a"
          : "recording.webm";
  formData.append(
    "file",
    file,
    typeof File !== "undefined" && file instanceof File && file.name.length > 0
      ? file.name
      : fallbackName,
  );
  formData.append("clientRequestId", clientRequestId);

  let response: Response;
  try {
    response = await fetchImplementation("/api/media/audio/transcribe", {
      method: "POST",
      body: formData,
      headers: { "X-Client-Request-Id": clientRequestId },
      signal,
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new AudioMediaApiClientError("provider_error", messageFor("provider_error"));
  }

  const body = await readJson(response);
  if (!response.ok) {
    const parsed = audioTranscriptionApiErrorResponseSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error.code : fallbackCode(response.status);
    throw new AudioMediaApiClientError(code, messageFor(code));
  }

  const parsed = audioTranscriptionApiResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new AudioMediaApiClientError(
      "invalid_transcription",
      messageFor("invalid_transcription"),
    );
  }
  return parsed.data;
}
