import { describe, expect, it } from "vitest";

import {
  AUDIO_MAX_DURATION_MS,
  AUDIO_MAX_SIZE_BYTES,
  AudioMediaValidationError,
  deriveAudioTitleFromTranscript,
  normalizeAudioMimeType,
  normalizeAudioTranscript,
  validateAudioMediaMetadata,
} from "../../../validation/media-audio";

describe("audio media validation", () => {
  it("normalizes browser MIME parameters and common aliases", () => {
    expect(normalizeAudioMimeType(" audio/webm;codecs=opus ")).toBe("audio/webm");
    expect(normalizeAudioMimeType("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeAudioMimeType("audio/x-mp3")).toBe("audio/mpeg");
    expect(
      validateAudioMediaMetadata({
        durationMs: 1_000,
        mimeType: "audio/ogg;codecs=opus",
        sizeBytes: 1024,
      }),
    ).toEqual({ durationMs: 1_000, mimeType: "audio/ogg", sizeBytes: 1024 });
  });

  it.each([
    ["empty_recording", { mimeType: "audio/webm", sizeBytes: 0 }],
    ["file_too_large", { mimeType: "audio/webm", sizeBytes: AUDIO_MAX_SIZE_BYTES + 1 }],
    [
      "recording_too_long",
      { mimeType: "audio/webm", sizeBytes: 1, durationMs: AUDIO_MAX_DURATION_MS + 1 },
    ],
    ["unsupported_media_type", { mimeType: "audio/flac", sizeBytes: 1 }],
  ] as const)("rejects %s", (code, input) => {
    expect(() => validateAudioMediaMetadata(input)).toThrowError(expect.objectContaining({ code }));
  });

  it("normalizes transcript controls while preserving newlines", () => {
    expect(normalizeAudioTranscript("  第一行\r\n第二行\u0000  ")).toBe("第一行\n第二行");
  });

  it("rejects an empty transcript and derives a deterministic short title", () => {
    expect(() => normalizeAudioTranscript(" \u0000 \t ")).toThrowError(
      expect.objectContaining<Partial<AudioMediaValidationError>>({
        code: "invalid_transcription",
      }),
    );
    expect(deriveAudioTitleFromTranscript("  记录今天的想法。\n第二句")).toBe("记录今天的想法");
    expect(deriveAudioTitleFromTranscript("\n---\n")).toBeNull();
  });
});
