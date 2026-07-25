import "server-only";

import { toFile } from "openai";
import OpenAI from "openai";
import type {
  Transcription,
  TranscriptionCreateParamsNonStreaming,
} from "openai/resources/audio/transcriptions";

import {
  AUDIO_MAX_SIZE_BYTES,
  AudioMediaValidationError,
  normalizeAudioMimeType,
  validateAudioMediaMetadata,
} from "../../../../validation/media-audio";
import {
  audioTranscriptionResultSchema,
  type AudioTranscriptionResult,
} from "../../../../validation/media-audio-api";
import {
  AUDIO_TRANSCRIPTION_RESPONSE_FORMAT,
  AUDIO_TRANSCRIPTION_TIMEOUT_MS,
} from "./audio-schema";
import { AudioTranscriptionError, normalizeAudioProviderError } from "./audio-errors";

export type OpenAIAudioTranscriptionsClient = Readonly<{
  audio: Readonly<{
    transcriptions: Readonly<{
      create: (
        body: TranscriptionCreateParamsNonStreaming<"json">,
        options?: Readonly<{ signal?: AbortSignal }>,
      ) => Promise<Transcription>;
    }>;
  }>;
}>;

export type AudioBlobLike = Pick<Blob, "arrayBuffer" | "size" | "type">;

export type TranscribeAudioInput = Readonly<{
  audio: AudioBlobLike;
  language?: string | null;
}>;

export type TranscribeAudioOptions = Readonly<{
  environment?: NodeJS.ProcessEnv;
  client?: OpenAIAudioTranscriptionsClient;
  signal?: AbortSignal;
  requestId?: string;
}>;

type AudioTranscriptionConfiguration = Readonly<{
  apiKey: string;
  model: string;
}>;

function readAudioTranscriptionConfiguration(
  environment: NodeJS.ProcessEnv,
): AudioTranscriptionConfiguration {
  if (environment.OPENAI_TRANSCRIPTION_ENABLED !== "true") {
    throw new AudioTranscriptionError("transcription_disabled");
  }

  const apiKey = environment.OPENAI_API_KEY?.trim();
  const model = environment.OPENAI_TRANSCRIPTION_MODEL?.trim();
  if (apiKey === undefined || apiKey.length === 0 || model === undefined || model.length === 0) {
    throw new AudioTranscriptionError("missing_configuration");
  }
  return { apiKey, model };
}

export function createConfiguredAudioOpenAIClient(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<{ client: OpenAI; model: string }> {
  const configuration = readAudioTranscriptionConfiguration(environment);
  return {
    client: new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: AUDIO_TRANSCRIPTION_TIMEOUT_MS,
    }),
    model: configuration.model,
  };
}

function normalizeAudioValidationError(error: unknown): AudioTranscriptionError {
  if (!(error instanceof AudioMediaValidationError)) {
    return new AudioTranscriptionError("invalid_request", { cause: error });
  }
  switch (error.code) {
    case "empty_recording":
      return new AudioTranscriptionError("empty_recording", { cause: error });
    case "unsupported_media_type":
      return new AudioTranscriptionError("unsupported_media_type", { cause: error });
    case "file_too_large":
    case "recording_too_long":
      return new AudioTranscriptionError("file_too_large", { cause: error });
    case "invalid_duration":
    case "invalid_transcription":
      return new AudioTranscriptionError("invalid_request", { cause: error });
  }
}

async function readAudioBytes(audio: AudioBlobLike): Promise<Uint8Array> {
  try {
    return new Uint8Array(await audio.arrayBuffer());
  } catch (error) {
    throw new AudioTranscriptionError("invalid_request", { cause: error });
  }
}

function audioFileName(mimeType: string): string {
  switch (normalizeAudioMimeType(mimeType)) {
    case "audio/ogg":
      return "recording.ogg";
    case "audio/wav":
      return "recording.wav";
    case "audio/mpeg":
      return "recording.mp3";
    case "audio/mp4":
      return "recording.m4a";
    case "audio/webm":
      return "recording.webm";
    default:
      return "recording.webm";
  }
}

function getAudioSizeRange(sizeBytes: number): string {
  if (sizeBytes <= 256 * 1024) return "0-256KB";
  if (sizeBytes <= 1024 * 1024) return "256KB-1MB";
  if (sizeBytes <= 5 * 1024 * 1024) return "1-5MB";
  return "5-15MB";
}

function logAudioProviderResponse(
  requestId: string,
  mediaType: string,
  sizeBytes: number,
  durationMs: number,
): void {
  const safeRequestId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(requestId)
      ? requestId
      : null;
  console.info("audio_transcription_provider_response", {
    requestId: safeRequestId,
    mediaType,
    fileSizeRange: getAudioSizeRange(sizeBytes),
    providerStatus: "received",
    durationMs: Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
  });
}

function parseTranscriptionResponse(response: unknown): AudioTranscriptionResult {
  const text =
    typeof response === "object" && response !== null && "text" in response
      ? (response as { text?: unknown }).text
      : null;
  const result = audioTranscriptionResultSchema.safeParse({ transcript: text });
  if (!result.success) {
    throw new AudioTranscriptionError("invalid_transcription", { cause: result.error });
  }
  return result.data;
}

export async function transcribeAudio(
  input: TranscribeAudioInput,
  options: TranscribeAudioOptions = {},
): Promise<AudioTranscriptionResult> {
  const environment = options.environment ?? process.env;
  const configuration = readAudioTranscriptionConfiguration(environment);
  const client =
    options.client ??
    new OpenAI({
      apiKey: configuration.apiKey,
      logLevel: "off",
      maxRetries: 0,
      timeout: AUDIO_TRANSCRIPTION_TIMEOUT_MS,
    });

  let metadata: ReturnType<typeof validateAudioMediaMetadata>;
  try {
    metadata = validateAudioMediaMetadata({
      mimeType: input.audio.type,
      sizeBytes: input.audio.size,
    });
  } catch (error) {
    throw normalizeAudioValidationError(error);
  }

  const bytes = await readAudioBytes(input.audio);
  if (bytes.byteLength === 0) {
    throw new AudioTranscriptionError("empty_recording");
  }
  // The browser Blob contract keeps `size` and `arrayBuffer()` in sync, but
  // the Route boundary must not rely on caller-supplied metadata. Enforce the
  // limit against the bytes that would actually be sent to the provider.
  if (bytes.byteLength > AUDIO_MAX_SIZE_BYTES) {
    throw new AudioTranscriptionError("file_too_large");
  }
  if (bytes.byteLength !== metadata.sizeBytes) {
    throw new AudioTranscriptionError("invalid_request");
  }

  let file: Awaited<ReturnType<typeof toFile>>;
  try {
    file = await toFile(bytes, audioFileName(metadata.mimeType), { type: metadata.mimeType });
  } catch (error) {
    throw new AudioTranscriptionError("invalid_request", { cause: error });
  }

  const request: TranscriptionCreateParamsNonStreaming<"json"> = {
    file,
    model: configuration.model,
    response_format: AUDIO_TRANSCRIPTION_RESPONSE_FORMAT,
    ...(input.language === null || input.language === undefined
      ? {}
      : { language: input.language }),
  };

  const providerStartedAt = performance.now();
  let response: Transcription;
  try {
    response = await client.audio.transcriptions.create(request, { signal: options.signal });
  } catch (error) {
    throw normalizeAudioProviderError(error);
  }

  if (options.requestId !== undefined) {
    logAudioProviderResponse(
      options.requestId,
      metadata.mimeType,
      metadata.sizeBytes,
      Math.round(performance.now() - providerStartedAt),
    );
  }

  return parseTranscriptionResponse(response);
}
