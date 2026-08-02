import "server-only";

import { randomUUID } from "node:crypto";

import { analyzeImage } from "../../../../../lib/server/openai/image/image-client";
import {
  createImageErrorResponse,
  createImageJsonResponse,
} from "../../../../../lib/server/openai/image/image-errors";
import { readImageAnalysisForm } from "../../../../../lib/server/openai/image/image-http";
import { imageAnalysisApiResultSchema } from "../../../../../lib/server/openai/image/image-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const form = await readImageAnalysisForm(request);
    const analysis = await analyzeImage(
      { image: form.file },
      {
        signal: request.signal,
        requestId,
      },
    );
    const response = imageAnalysisApiResultSchema.parse({
      requestId,
      clientRequestId: form.clientRequestId,
      analysis,
    });
    return createImageJsonResponse(response);
  } catch (error) {
    return createImageErrorResponse(error, requestId);
  }
}
