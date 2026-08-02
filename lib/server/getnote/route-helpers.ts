import "server-only";

import {
  linkImportApiErrorResponseSchema,
  type LinkImportApiErrorResponse,
} from "../../../validation/link-import-api";
import { getLinkImportErrorHttpStatus, GetNoteError, toGetNoteError } from "./getnote-errors";
import {
  LINK_IMPORT_ROUTE_REQUEST_MAX_BYTES,
  readLimitedTextBody,
  TextBodyLimitError,
} from "./safe-json";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export function createLinkImportJsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function readLinkImportRouteJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new GetNoteError("invalid_request");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > LINK_IMPORT_ROUTE_REQUEST_MAX_BYTES) {
    throw new GetNoteError("invalid_request");
  }

  try {
    const text = await readLimitedTextBody(request.body, LINK_IMPORT_ROUTE_REQUEST_MAX_BYTES);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof TextBodyLimitError || error instanceof SyntaxError) {
      throw new GetNoteError("invalid_request", { cause: error });
    }

    throw error;
  }
}

export function createLinkImportErrorResponse(error: unknown): Response {
  const getNoteError = toGetNoteError(error);
  const body: LinkImportApiErrorResponse = {
    error: {
      code: getNoteError.code,
      message: getNoteError.message,
      requestId: getNoteError.requestId,
    },
  };

  return createLinkImportJsonResponse(
    linkImportApiErrorResponseSchema.parse(body),
    getLinkImportErrorHttpStatus(getNoteError.code),
  );
}
