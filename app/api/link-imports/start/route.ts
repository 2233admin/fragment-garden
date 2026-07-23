import {
  completedLinkImportPayloadSchema,
  startLinkImportRequestSchema,
  startLinkImportSuccessResponseSchema,
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
    const inputResult = startLinkImportRequestSchema.safeParse(body);

    if (!inputResult.success) {
      throw new GetNoteError("invalid_request", { cause: inputResult.error });
    }

    const saveResult = await getNoteClient.saveLink(inputResult.data.url);
    if (saveResult.status === "pending") {
      const response = startLinkImportSuccessResponseSchema.parse({
        status: "pending",
        taskId: saveResult.taskId,
        requestId: saveResult.requestId,
      });

      return createLinkImportJsonResponse(response, 202);
    }

    const detail = await getNoteClient.getNoteDetail(saveResult.externalNoteId);
    const response = completedLinkImportPayloadSchema.parse({
      status: "completed",
      ...detail,
    });

    return createLinkImportJsonResponse(response);
  } catch (error) {
    return createLinkImportErrorResponse(error);
  }
}
