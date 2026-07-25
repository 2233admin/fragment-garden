/** Validation shared by the browser image picker and the media Route. */

export const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
// A small compressed image can expand to a very large bitmap. Keep the
// browser preview and provider request bounded without adding a server-side
// image decoder dependency.
export const IMAGE_MAX_DIMENSION = 32_768;
export const IMAGE_MAX_PIXELS = 100_000_000;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type SupportedImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type ImageValidationErrorCode =
  | "empty_file"
  | "unsupported_media_type"
  | "file_too_large"
  | "invalid_image"
  | "invalid_dimensions";

export class ImageMediaValidationError extends Error {
  readonly code: ImageValidationErrorCode;

  constructor(code: ImageValidationErrorCode, message: string) {
    super(message);
    this.name = "ImageMediaValidationError";
    this.code = code;
  }
}

export type ImageMediaMetadataInput = Readonly<{
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}>;

export type ValidatedImageMediaMetadata = Readonly<{
  mimeType: SupportedImageMimeType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}>;

function isSupportedImageMimeType(value: string): value is SupportedImageMimeType {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

export function normalizeImageMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

function validateDimension(value: number | null | undefined, fieldName: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ImageMediaValidationError(
      "invalid_dimensions",
      `${fieldName} must be a positive integer`,
    );
  }

  if (value > IMAGE_MAX_DIMENSION) {
    throw new ImageMediaValidationError(
      "invalid_dimensions",
      `${fieldName} exceeds the supported image dimensions`,
    );
  }

  return value;
}

export function validateImageMediaMetadata(
  input: ImageMediaMetadataInput,
): ValidatedImageMediaMetadata {
  if (typeof input.mimeType !== "string") {
    throw new ImageMediaValidationError("unsupported_media_type", "An image MIME type is required");
  }

  const mimeType = normalizeImageMimeType(input.mimeType);
  if (!isSupportedImageMimeType(mimeType)) {
    throw new ImageMediaValidationError(
      "unsupported_media_type",
      "Only PNG, JPEG, and WebP images are supported",
    );
  }

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ImageMediaValidationError("empty_file", "The image file is empty");
  }

  if (input.sizeBytes > IMAGE_MAX_SIZE_BYTES) {
    throw new ImageMediaValidationError("file_too_large", "The image file is too large");
  }

  const width = validateDimension(input.width, "width");
  const height = validateDimension(input.height, "height");
  if ((width === null) !== (height === null)) {
    throw new ImageMediaValidationError(
      "invalid_dimensions",
      "Both image width and height are required together",
    );
  }

  if (
    width !== null &&
    height !== null &&
    (width > Math.floor(IMAGE_MAX_PIXELS / height) || height > Math.floor(IMAGE_MAX_PIXELS / width))
  ) {
    throw new ImageMediaValidationError("invalid_dimensions", "The image has too many pixels");
  }

  return { mimeType, sizeBytes: input.sizeBytes, width, height };
}

export type ImageBlobLike = Pick<Blob, "arrayBuffer" | "size" | "type">;

function hasBytes(bytes: Uint8Array, offset: number, length: number): boolean {
  return offset >= 0 && length >= 0 && offset + length <= bytes.byteLength;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/** Detects the real container signature; file extensions are intentionally ignored. */
export function detectImageMimeType(bytes: Uint8Array): SupportedImageMimeType | null {
  if (
    hasBytes(bytes, 0, 8) &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (hasBytes(bytes, 0, 3) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (hasBytes(bytes, 0, 12) && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  return null;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!hasBytes(bytes, 0, 24)) {
    return null;
  }

  // The first chunk must be IHDR; otherwise offsets 16/20 can be attacker-
  // controlled bytes from an unrelated chunk that only happens to look valid.
  if (ascii(bytes, 12, 4) !== "IHDR") {
    return null;
  }

  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!hasBytes(bytes, 0, 4) || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (hasBytes(bytes, offset, 3)) {
    if (bytes[offset] !== 0xff) {
      return null;
    }

    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }
    if (!hasBytes(bytes, offset, 2)) {
      return null;
    }

    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || !hasBytes(bytes, offset, segmentLength)) {
      return null;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7) {
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!hasBytes(bytes, 0, 16) || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }

  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && hasBytes(bytes, 24, 6)) {
    return {
      width: readUint24LE(bytes, 24) + 1,
      height: readUint24LE(bytes, 27) + 1,
    };
  }

  if (chunk === "VP8 " && hasBytes(bytes, 26, 10)) {
    const frameStart = bytes.indexOf(0x9d, 20);
    if (frameStart >= 0 && hasBytes(bytes, frameStart + 1, 3)) {
      const width = readUint16LE(bytes, frameStart + 3) & 0x3fff;
      const height = readUint16LE(bytes, frameStart + 5) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
  }

  if (chunk === "VP8L" && hasBytes(bytes, 21, 5) && bytes[20] === 0x2f) {
    const bits = readUint32LE(bytes, 21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  return null;
}

export function readImageDimensions(
  bytes: Uint8Array,
  mimeType: SupportedImageMimeType,
): { width: number; height: number } | null {
  switch (mimeType) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
  }
}

/**
 * Performs a format-signature and header check without using DOM APIs. The caller should still
 * decode the Blob in the browser before showing it as a preview.
 */
export async function validateImageBlob(blob: ImageBlobLike): Promise<ValidatedImageMediaMetadata> {
  const metadata = validateImageMediaMetadata({
    mimeType: blob.type,
    sizeBytes: blob.size,
  });
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    throw new ImageMediaValidationError("invalid_image", "The image data could not be read");
  }

  // Blob metadata normally agrees with the byte payload. Keep the check here
  // because Route adapters and tests can provide Blob-like objects whose size
  // is not trustworthy; the byte cap must apply to what is actually sent.
  if (bytes.byteLength === 0) {
    throw new ImageMediaValidationError("empty_file", "The image file is empty");
  }
  if (bytes.byteLength > IMAGE_MAX_SIZE_BYTES) {
    throw new ImageMediaValidationError("file_too_large", "The image file is too large");
  }
  if (bytes.byteLength !== metadata.sizeBytes) {
    throw new ImageMediaValidationError("invalid_image", "The image data size is invalid");
  }
  const detectedMimeType = detectImageMimeType(bytes);
  if (detectedMimeType !== metadata.mimeType) {
    throw new ImageMediaValidationError("invalid_image", "The image data is not valid");
  }

  const dimensions = readImageDimensions(bytes, metadata.mimeType);
  if (dimensions === null) {
    throw new ImageMediaValidationError("invalid_image", "The image dimensions could not be read");
  }

  return validateImageMediaMetadata({ ...metadata, ...dimensions });
}
