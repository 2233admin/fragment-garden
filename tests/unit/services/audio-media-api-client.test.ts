import { describe, expect, it, vi } from "vitest";

import {
  AudioMediaApiClientError,
  transcribeAudioMedia,
} from "../../../services/audio-media-api-client";

function audioFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "note.webm", { type: "audio/webm" });
}

function successResponse(transcript = "模拟转写") {
  return new Response(
    JSON.stringify({
      requestId: "11111111-1111-4111-8111-111111111111",
      clientRequestId: "request-1",
      transcription: { transcript },
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

describe("audio transcription API client", () => {
  it("sends only the file and client request id and validates the response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(successResponse());
    const result = await transcribeAudioMedia(
      audioFile(),
      "request-1",
      undefined,
      fetchImplementation,
    );

    expect(result.transcription.transcript).toBe("模拟转写");
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/media/audio/transcribe",
      expect.objectContaining({ method: "POST", headers: { "X-Client-Request-Id": "request-1" } }),
    );
    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
    const body = request?.body as FormData;
    expect(body.get("clientRequestId")).toBe("request-1");
    expect(body.get("file")).toBeInstanceOf(File);
    expect(body.get("model")).toBeNull();
  });

  it("normalizes server errors and rejects invalid local media before fetch", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      transcribeAudioMedia(
        new Blob(["bad"], { type: "audio/flac" }),
        "request-1",
        undefined,
        fetchImplementation,
      ),
    ).rejects.toMatchObject({ code: "unsupported_media_type" });
    expect(fetchImplementation).not.toHaveBeenCalled();

    fetchImplementation.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "rate_limited",
            message: "private provider detail",
            requestId: "11111111-1111-4111-8111-111111111111",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 429 },
      ),
    );
    await expect(
      transcribeAudioMedia(audioFile(), "request-1", undefined, fetchImplementation),
    ).rejects.toMatchObject({ code: "rate_limited" });
    try {
      await transcribeAudioMedia(audioFile(), "request-1", undefined, fetchImplementation);
    } catch (error) {
      expect(error).toBeInstanceOf(AudioMediaApiClientError);
      expect((error as Error).message).not.toContain("private provider detail");
    }
  });

  it("does not convert an aborted request into a provider error", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImplementation = vi.fn<typeof fetch>().mockRejectedValue(new Error("aborted"));

    await expect(
      transcribeAudioMedia(audioFile(), "request-1", controller.signal, fetchImplementation),
    ).rejects.toThrow("aborted");
  });
});
