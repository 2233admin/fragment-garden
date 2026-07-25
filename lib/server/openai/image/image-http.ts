import "server-only";

import {
  IMAGE_MAX_SIZE_BYTES,
  IMAGE_MIME_TYPES,
  normalizeImageMimeType,
} from "../../../../validation/media-image";
import { imageClientRequestIdSchema } from "./image-schema";
import { IMAGE_ROUTE_REQUEST_MAX_BYTES, ImageAnalysisError } from "./image-errors";

export const IMAGE_FORM_FILE_FIELD = "file";
export const IMAGE_FORM_CLIENT_REQUEST_ID_FIELD = "clientRequestId";

export type ImageAnalysisForm = Readonly<{
  file: File;
  clientRequestId: string;
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
  if (body === null) {
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value === undefined) {
        continue;
      }
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
  if (header === null || header.trim().length === 0) {
    return null;
  }

  if (!/^\d+$/u.test(header.trim())) {
    throw new ImageAnalysisError("invalid_request");
  }

  const length = Number(header.trim());
  if (!Number.isSafeInteger(length)) {
    throw new ImageAnalysisError("file_too_large");
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
  const allowed = new Set([IMAGE_FORM_FILE_FIELD, IMAGE_FORM_CLIENT_REQUEST_ID_FIELD]);
  for (const key of formData.keys()) {
    if (!allowed.has(key)) {
      throw new ImageAnalysisError("invalid_request");
    }
  }
}

/**
 * Parse only the two fields accepted by the image Route. The bounded body is
 * reparsed so chunked requests cannot bypass the size check in formData().
 */
export async function readImageAnalysisForm(request: Request): Promise<ImageAnalysisForm> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/iu.test(contentType)) {
    throw new ImageAnalysisError("invalid_request");
  }

  const contentLength = parseContentLength(request);
  if (contentLength !== null && contentLength > IMAGE_ROUTE_REQUEST_MAX_BYTES) {
    throw new ImageAnalysisError("file_too_large");
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBytes(request.body, IMAGE_ROUTE_REQUEST_MAX_BYTES);
  } catch (error) {
    if (error instanceof BinaryBodyLimitError) {
      throw new ImageAnalysisError("file_too_large", { cause: error });
    }
    throw error;
  }

  if (bytes.byteLength === 0) {
    throw new ImageAnalysisError("invalid_request");
  }

  let formData: FormData;
  try {
    // Request's BodyInit typing excludes Uint8Array<ArrayBufferLike> under strict TS;
    // copy into a concrete ArrayBuffer while preserving the already-enforced byte cap.
    const boundedBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(boundedBuffer).set(bytes);
    const boundedRequest = new Request(request.url, {
      method: "POST",
      headers: { "content-type": contentType },
      body: boundedBuffer,
    });
    formData = await boundedRequest.formData();
  } catch (error) {
    throw new ImageAnalysisError("invalid_request", { cause: error });
  }

  assertKnownFields(formData);

  const fileEntries = formData.getAll(IMAGE_FORM_FILE_FIELD);
  if (fileEntries.length !== 1 || !isFileEntry(fileEntries[0])) {
    throw new ImageAnalysisError("invalid_request");
  }

  const requestIdEntries = formData.getAll(IMAGE_FORM_CLIENT_REQUEST_ID_FIELD);
  if (requestIdEntries.length !== 1 || typeof requestIdEntries[0] !== "string") {
    throw new ImageAnalysisError("invalid_request");
  }
  const clientRequestIdResult = imageClientRequestIdSchema.safeParse(requestIdEntries[0]);
  if (!clientRequestIdResult.success) {
    throw new ImageAnalysisError("invalid_request", { cause: clientRequestIdResult.error });
  }

  const file = fileEntries[0];
  if (file.size <= 0) {
    throw new ImageAnalysisError("invalid_image");
  }
  if (file.size > IMAGE_MAX_SIZE_BYTES) {
    throw new ImageAnalysisError("file_too_large");
  }
  const mimeType = normalizeImageMimeType(file.type);
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new ImageAnalysisError("unsupported_media_type");
  }

  return { file, clientRequestId: clientRequestIdResult.data };
}
