import "server-only";

import { randomUUID } from "node:crypto";

import {
  sproutAnalyzeRequestSchema,
  sproutApiResultSchema,
} from "../../../../validation/sprout-api";
import { analyzeSprout } from "../../../../lib/server/openai/sprout/sprout-client";
import {
  createSproutErrorResponse,
  createSproutJsonResponse,
  readSproutRouteJson,
  SproutError,
} from "../../../../lib/server/openai/sprout/sprout-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const body = await readSproutRouteJson(request);
    const inputResult = sproutAnalyzeRequestSchema.safeParse(body);
    if (!inputResult.success) {
      throw new SproutError("request_validation_failed", { cause: inputResult.error });
    }

    const result = await analyzeSprout(inputResult.data, {
      signal: request.signal,
      requestId,
    });
    return createSproutJsonResponse(sproutApiResultSchema.parse(result));
  } catch (error) {
    return createSproutErrorResponse(error);
  }
}
