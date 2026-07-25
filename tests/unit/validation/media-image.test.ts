import { describe, expect, it } from "vitest";

import {
  IMAGE_MAX_DIMENSION,
  IMAGE_MAX_SIZE_BYTES,
  detectImageMimeType,
  validateImageBlob,
  validateImageMediaMetadata,
} from "../../../validation/media-image";

function bytesFromHex(hex: string): ArrayBuffer {
  const bytes = Uint8Array.from(
    hex.match(/.{2}/gu)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
  );
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

const ONE_BY_ONE_PNG = bytesFromHex(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082",
);

describe("image media validation", () => {
  it("accepts supported MIME types and normalizes their case", () => {
    expect(
      validateImageMediaMetadata({
        mimeType: " IMAGE/PNG ",
        sizeBytes: 100,
        width: 640,
        height: 480,
      }),
    ).toEqual({
      mimeType: "image/png",
      sizeBytes: 100,
      width: 640,
      height: 480,
    });
  });

  it.each(["image/gif", "image/svg+xml", "image/heic", "application/octet-stream"])(
    "rejects unsupported MIME type %s",
    (mimeType) => {
      expect(() => validateImageMediaMetadata({ mimeType, sizeBytes: 10 })).toThrow("supported");
    },
  );

  it("rejects empty, oversized, and malformed dimension metadata", () => {
    expect(() => validateImageMediaMetadata({ mimeType: "image/png", sizeBytes: 0 })).toThrow(
      "empty",
    );
    expect(() =>
      validateImageMediaMetadata({
        mimeType: "image/png",
        sizeBytes: IMAGE_MAX_SIZE_BYTES + 1,
      }),
    ).toThrow("large");
    expect(() =>
      validateImageMediaMetadata({ mimeType: "image/png", sizeBytes: 10, width: 0, height: 1 }),
    ).toThrow("positive");
    expect(() =>
      validateImageMediaMetadata({ mimeType: "image/png", sizeBytes: 10, width: 1 }),
    ).toThrow("together");
    expect(() =>
      validateImageMediaMetadata({
        mimeType: "image/png",
        sizeBytes: 10,
        width: IMAGE_MAX_DIMENSION + 1,
        height: 1,
      }),
    ).toThrow("dimensions");
    expect(() =>
      validateImageMediaMetadata({
        mimeType: "image/png",
        sizeBytes: 10,
        width: 11_000,
        height: 10_000,
      }),
    ).toThrow("pixels");
  });

  it("checks the actual image signature and dimensions instead of the extension", async () => {
    const validPng = new Blob([ONE_BY_ONE_PNG], { type: "image/png" });
    await expect(validateImageBlob(validPng)).resolves.toMatchObject({
      mimeType: "image/png",
      width: 1,
      height: 1,
    });
    expect(detectImageMimeType(new Uint8Array(ONE_BY_ONE_PNG))).toBe("image/png");

    const spoofedMime = new Blob([ONE_BY_ONE_PNG], { type: "image/jpeg" });
    await expect(validateImageBlob(spoofedMime)).rejects.toMatchObject({
      code: "invalid_image",
    });
    await expect(
      validateImageBlob(new Blob(["not an image"], { type: "image/png" })),
    ).rejects.toMatchObject({ code: "invalid_image" });

    const malformedPng = new Uint8Array(ONE_BY_ONE_PNG.slice(0));
    malformedPng.set([0x49, 0x44, 0x41, 0x54], 12); // IDAT where the first IHDR chunk is required
    await expect(
      validateImageBlob(new Blob([malformedPng], { type: "image/png" })),
    ).rejects.toMatchObject({ code: "invalid_image" });

    const oversizedBitmap = new Uint8Array(ONE_BY_ONE_PNG.slice(0));
    const oversizedBitmapView = new DataView(oversizedBitmap.buffer);
    oversizedBitmapView.setUint32(16, 11_000);
    oversizedBitmapView.setUint32(20, 10_000);
    await expect(
      validateImageBlob(new Blob([oversizedBitmap], { type: "image/png" })),
    ).rejects.toMatchObject({ code: "invalid_dimensions" });
  });
});
