import "server-only";

import {
  AudioMediaValidationError,
  AUDIO_MAX_SIZE_BYTES,
  normalizeAudioMimeType,
  validateAudioMediaMetadata,
} from "../../../../validation/media-audio";
import { audioClientRequestIdSchema } from "./audio-schema";
import { AUDIO_ROUTE_REQUEST_MAX_BYTES, AudioTranscriptionError } from "./audio-errors";

export const AUDIO_FORM_FILE_FIELD = "file";
export const AUDIO_FORM_CLIENT_REQUEST_ID_FIELD = "clientRequestId";
export const AUDIO_FORM_LANGUAGE_FIELD = "language";

export type AudioTranscriptionForm = Readonly<{
  file: File;
  clientRequestId: string;
  language: string | null;
}>;

export class BinaryBodyLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the ${maxBytes} byte limit`);
    this.name = "BinaryBodyLimitError";
  }
}

/** Read a request body with a hard cap before invoking the multipart parser. */
export async function readLimitedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array();

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      byteCount += value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel();
        throw new BinaryBodyLimitError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseContentLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (header === null || header.trim().length === 0) return null;
  if (!/^\d+$/u.test(header.trim())) {
    throw new AudioTranscriptionError("invalid_request");
  }

  const length = Number(header.trim());
  if (!Number.isSafeInteger(length)) {
    throw new AudioTranscriptionError("file_too_large");
  }
  return length;
}

function isFileEntry(value: FormDataEntryValue | null): value is File {
  return (
    typeof value !== "string" &&
    typeof value === "object" &&
    value !== null &&
    typeof value.arrayBuffer === "function" &&
    typeof value.size === "number" &&
    typeof value.type === "string"
  );
}

function assertKnownFields(formData: FormData): void {
  const allowed = new Set([
    AUDIO_FORM_FILE_FIELD,
    AUDIO_FORM_CLIENT_REQUEST_ID_FIELD,
    AUDIO_FORM_LANGUAGE_FIELD,
  ]);
  for (const key of formData.keys()) {
    if (!allowed.has(key)) throw new AudioTranscriptionError("invalid_request");
  }
}

function normalizeValidationError(error: unknown): AudioTranscriptionError {
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

/** Parse only the bounded multipart fields accepted by the transcription Route. */
export async function readAudioTranscriptionForm(
  request: Request,
): Promise<AudioTranscriptionForm> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/iu.test(contentType)) {
    throw new AudioTranscriptionError("invalid_request");
  }

  const contentLength = parseContentLength(request);
  if (contentLength !== null && contentLength > AUDIO_ROUTE_REQUEST_MAX_BYTES) {
    throw new AudioTranscriptionError("file_too_large");
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBytes(request.body, AUDIO_ROUTE_REQUEST_MAX_BYTES);
  } catch (error) {
    if (error instanceof BinaryBodyLimitError) {
      throw new AudioTranscriptionError("file_too_large", { cause: error });
    }
    throw error;
  }
  if (bytes.byteLength === 0) throw new AudioTranscriptionError("invalid_request");

  let formData: FormData;
  try {
    // Reparse the bounded copy so chunked requests cannot bypass the size check.
    const boundedBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(boundedBuffer).set(bytes);
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: boundedBuffer,
    });
    formData = await boundedRequest.formData();
  } catch (error) {
    throw new AudioTranscriptionError("invalid_request", { cause: error });
  }

  assertKnownFields(formData);

  const fileEntries = formData.getAll(AUDIO_FORM_FILE_FIELD);
  if (fileEntries.length !== 1 || !isFileEntry(fileEntries[0])) {
    throw new AudioTranscriptionError("invalid_request");
  }
  const requestIdEntries = formData.getAll(AUDIO_FORM_CLIENT_REQUEST_ID_FIELD);
  if (requestIdEntries.length !== 1 || typeof requestIdEntries[0] !== "string") {
    throw new AudioTranscriptionError("invalid_request");
  }
  const requestIdResult = audioClientRequestIdSchema.safeParse(requestIdEntries[0]);
  if (!requestIdResult.success) {
    throw new AudioTranscriptionError("invalid_request", { cause: requestIdResult.error });
  }

  const languageEntries = formData.getAll(AUDIO_FORM_LANGUAGE_FIELD);
  if (
    languageEntries.length > 1 ||
    (languageEntries.length === 1 && typeof languageEntries[0] !== "string")
  ) {
    throw new AudioTranscriptionError("invalid_request");
  }
  let language: string | null = null;
  if (languageEntries.length === 1) {
    const value = (languageEntries[0] as string).trim().toLowerCase();
    if (!/^[a-z]{2}$/u.test(value)) {
      throw new AudioTranscriptionError("invalid_request");
    }
    language = value;
  }

  const file = fileEntries[0];
  try {
    validateAudioMediaMetadata({
      mimeType: file.type,
      sizeBytes: file.size,
    });
  } catch (error) {
    throw normalizeValidationError(error);
  }
  if (file.size > AUDIO_MAX_SIZE_BYTES) {
    throw new AudioTranscriptionError("file_too_large");
  }

  return {
    file,
    clientRequestId: requestIdResult.data,
    language,
  };
}

export function normalizedAudioMimeType(file: File): string {
  return normalizeAudioMimeType(file.type);
}
