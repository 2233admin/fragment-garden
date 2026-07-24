import "server-only";

import {
  companionApiResultSchema,
  companionRequestSchema,
} from "../../../../lib/server/openai/companion-schemas";
import {
  createCompanionErrorResponse,
  createCompanionJsonResponse,
  readCompanionRouteJson,
  toCompanionError,
} from "../../../../lib/server/openai/companion-errors";
import { generateCompanionResponse } from "../../../../lib/server/openai/openai-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readCompanionRouteJson(request);
    const inputResult = companionRequestSchema.safeParse(body);
    if (!inputResult.success) {
      throw toCompanionError(inputResult.error);
    }

    const result = await generateCompanionResponse(inputResult.data);
    return createCompanionJsonResponse(companionApiResultSchema.parse(result));
  } catch (error) {
    return createCompanionErrorResponse(error);
  }
}
