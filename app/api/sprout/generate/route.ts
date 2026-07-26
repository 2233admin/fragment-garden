import "server-only";

import { randomUUID } from "node:crypto";

import { generateSproutNote } from "../../../../lib/server/openai/sprout/sprout-generate-client";
import {
  createSproutErrorResponse,
  createSproutJsonResponse,
  readSproutRouteJson,
  SproutError,
} from "../../../../lib/server/openai/sprout/sprout-errors";
import {
  sproutGenerateRequestSchema,
  sproutGeneratedNoteSchema,
} from "../../../../validation/sprout-generate-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const body = await readSproutRouteJson(request);
    const input = sproutGenerateRequestSchema.safeParse(body);
    if (!input.success) {
      throw new SproutError("request_validation_failed", { cause: input.error });
    }
    const result = await generateSproutNote(input.data, {
      requestId,
      signal: request.signal,
    });
    return createSproutJsonResponse(sproutGeneratedNoteSchema.parse(result));
  } catch (error) {
    return createSproutErrorResponse(error);
  }
}
