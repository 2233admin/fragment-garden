import {
  completedLinkImportPayloadSchema,
  getLinkImportProgressRequestSchema,
  getLinkImportProgressSuccessResponseSchema,
} from "../../../../validation/link-import-api";
import { GetNoteError } from "../../../../lib/server/getnote/getnote-errors";
import { createConfiguredGetNoteClient } from "../../../../lib/server/getnote/getnote-client";
import {
  createLinkImportErrorResponse,
  createLinkImportJsonResponse,
  readLinkImportRouteJson,
} from "../../../../lib/server/getnote/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const getNoteClient = createConfiguredGetNoteClient();
    const body = await readLinkImportRouteJson(request);
    const inputResult = getLinkImportProgressRequestSchema.safeParse(body);

    if (!inputResult.success) {
      throw new GetNoteError("invalid_request", { cause: inputResult.error });
    }

    const progress = await getNoteClient.getTaskProgress(inputResult.data.taskId);
    if (progress.status !== "success") {
      if (progress.status === "failed") {
        throw new GetNoteError("provider_processing_failed", {
          requestId: progress.requestId,
        });
      }

      const response = getLinkImportProgressSuccessResponseSchema.parse({
        status: progress.status,
        requestId: progress.requestId,
      });

      return createLinkImportJsonResponse(response);
    }

    const detail = await getNoteClient.getNoteDetail(progress.externalNoteId);
    const response = completedLinkImportPayloadSchema.parse({
      status: "completed",
      ...detail,
    });

    return createLinkImportJsonResponse(response);
  } catch (error) {
    return createLinkImportErrorResponse(error);
  }
}
