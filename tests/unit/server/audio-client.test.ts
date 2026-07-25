import { describe, expect, it, vi } from "vitest";

import { AUDIO_MAX_SIZE_BYTES } from "../../../validation/media-audio";
import {
  transcribeAudio,
  type OpenAIAudioTranscriptionsClient,
} from "../../../lib/server/openai/audio/audio-client";

vi.mock("server-only", () => ({}));

const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OPENAI_TRANSCRIPTION_ENABLED: "true",
  OPENAI_API_KEY: "test-key",
  OPENAI_TRANSCRIPTION_MODEL: "test-transcription-model",
};

function createClient(): {
  client: OpenAIAudioTranscriptionsClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn();
  return {
    client: { audio: { transcriptions: { create } } },
    create,
  };
}

describe("audio transcription provider boundary", () => {
  it("enforces the size limit against bytes returned by arrayBuffer", async () => {
    const { client, create } = createClient();
    const actualBytes = new Uint8Array(AUDIO_MAX_SIZE_BYTES + 1);
    const deceptiveAudio = {
      type: "audio/webm",
      // A caller-controlled size must not be trusted at the provider boundary.
      size: 1,
      arrayBuffer: async () => actualBytes.buffer,
    };

    await expect(
      transcribeAudio({ audio: deceptiveAudio }, { client, environment: ENVIRONMENT }),
    ).rejects.toMatchObject({ code: "file_too_large" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects bytes whose length disagrees with the declared size", async () => {
    const { client, create } = createClient();
    const deceptiveAudio = {
      type: "audio/webm",
      size: 1,
      arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
    };

    await expect(
      transcribeAudio({ audio: deceptiveAudio }, { client, environment: ENVIRONMENT }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(create).not.toHaveBeenCalled();
  });
});
