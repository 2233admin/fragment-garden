import "server-only";

import { GetNoteError, toGetNoteError } from "./getnote-errors";
import { getNoteProviderEnvelopeSchema, getNoteProviderErrorSchema } from "./getnote-schemas";
import {
  GETNOTE_RESPONSE_MAX_BYTES,
  parseGetNoteJson,
  readLimitedTextBody,
  TextBodyLimitError,
} from "./safe-json";

export const GETNOTE_REQUEST_TIMEOUT_MS = 30_000;

export type FetchImplementation = typeof fetch;

export type GetNoteProviderResponse = {
  data: unknown;
  requestId: string | null;
};

type GetNoteProviderConfiguration = Readonly<{
  apiKey: string;
  clientId: string;
}>;

type GetNoteProviderRequestOptions = Readonly<{
  url: URL;
  method: "GET" | "POST";
  body?: Readonly<Record<string, string>>;
}>;

export type GetNoteProviderRequester = (
  options: GetNoteProviderRequestOptions,
) => Promise<GetNoteProviderResponse>;

function normalizeProviderFailure(
  httpStatus: number,
  providerError: unknown,
  requestId: string | null,
): GetNoteError {
  const parsedError = getNoteProviderErrorSchema.safeParse(providerError);
  const errorCode = parsedError.success ? String(parsedError.data.code ?? "") : "";
  const reason = parsedError.success ? (parsedError.data.reason ?? "") : "";

  if (reason === "not_member" || errorCode === "10201") {
    return new GetNoteError("membership_required", { requestId });
  }

  if (reason.startsWith("quota_") || errorCode === "10203" || errorCode === "42900") {
    return new GetNoteError("quota_exceeded", { requestId });
  }

  if (reason.startsWith("qps_") || errorCode === "10202" || httpStatus === 429) {
    return new GetNoteError("rate_limited", { requestId });
  }

  if (httpStatus === 401 || errorCode === "10001") {
    return new GetNoteError("service_unavailable", { requestId });
  }

  return new GetNoteError("platform_unavailable", { requestId });
}

export function createGetNoteProviderRequester(
  configuration: GetNoteProviderConfiguration,
  fetchImplementation: FetchImplementation,
): GetNoteProviderRequester {
  return async (options): Promise<GetNoteProviderResponse> => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, GETNOTE_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchImplementation(options.url, {
        method: options.method,
        headers: {
          Authorization: configuration.apiKey,
          "X-Client-ID": configuration.clientId,
          ...(options.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
        signal: abortController.signal,
      });

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > GETNOTE_RESPONSE_MAX_BYTES) {
        throw new TextBodyLimitError(GETNOTE_RESPONSE_MAX_BYTES);
      }

      const responseText = await readLimitedTextBody(response.body, GETNOTE_RESPONSE_MAX_BYTES);

      let parsedBody: unknown;
      try {
        parsedBody = parseGetNoteJson(responseText);
      } catch (error) {
        if (!response.ok) {
          throw normalizeProviderFailure(response.status, null, null);
        }

        throw new GetNoteError("invalid_provider_response", { cause: error });
      }

      const envelopeResult = getNoteProviderEnvelopeSchema.safeParse(parsedBody);
      if (!envelopeResult.success) {
        if (!response.ok) {
          throw normalizeProviderFailure(response.status, null, null);
        }

        throw new GetNoteError("invalid_provider_response", {
          cause: envelopeResult.error,
        });
      }

      const requestId = envelopeResult.data.request_id ?? null;
      if (!response.ok || !envelopeResult.data.success) {
        throw normalizeProviderFailure(response.status, envelopeResult.data.error, requestId);
      }

      return {
        data: envelopeResult.data.data,
        requestId,
      };
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new GetNoteError("processing_timeout", { cause: error });
      }

      if (error instanceof TextBodyLimitError || error instanceof SyntaxError) {
        throw new GetNoteError("invalid_provider_response", { cause: error });
      }

      throw toGetNoteError(error);
    } finally {
      clearTimeout(timeout);
    }
  };
}
