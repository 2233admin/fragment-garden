import "server-only";

import { randomUUID } from "node:crypto";

import { transcribeAudio } from "../../../../../lib/server/openai/audio/audio-client";
import {
  createAudioErrorResponse,
  createAudioJsonResponse,
} from "../../../../../lib/server/openai/audio/audio-errors";
import { readAudioTranscriptionForm } from "../../../../../lib/server/openai/audio/audio-http";
import { audioTranscriptionApiResultSchema } from "../../../../../lib/server/openai/audio/audio-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const form = await readAudioTranscriptionForm(request);
    const transcription = await transcribeAudio(
      { audio: form.file, language: form.language },
      { signal: request.signal, requestId },
    );
    const response = audioTranscriptionApiResultSchema.parse({
      requestId,
      clientRequestId: form.clientRequestId,
      transcription,
    });
    return createAudioJsonResponse(response);
  } catch (error) {
    return createAudioErrorResponse(error, requestId);
  }
}
