import "server-only";

import { z } from "zod";

import { parseExternalUrl } from "../../../validation/external-url";
import { sanitizeGetNoteDetail, type SanitizedGetNoteDetail } from "./getnote-content";
import { GetNoteError } from "./getnote-errors";
import { createGetNoteProviderRequester, type FetchImplementation } from "./getnote-http";
import {
  noteDetailProviderDataSchema,
  saveLinkProviderDataSchema,
  taskProgressProviderDataSchema,
} from "./getnote-schemas";

const GETNOTE_BASE_URL = "https://openapi.biji.com";
const SAVE_LINK_PATH = "/open/api/v1/resource/note/save";
const TASK_PROGRESS_PATH = "/open/api/v1/resource/note/task/progress";
const NOTE_DETAIL_PATH = "/open/api/v1/resource/note/detail";

export { GETNOTE_REQUEST_TIMEOUT_MS } from "./getnote-http";

const providerIdentifierSchema = z.string().trim().min(1).max(200);
const getNoteConfigurationSchema = z
  .object({
    apiKey: z.string().trim().min(1),
    clientId: z.string().trim().min(1),
  })
  .strict();

type GetNoteConfiguration = z.infer<typeof getNoteConfigurationSchema>;

export type SaveLinkResult =
  | {
      status: "pending";
      taskId: string;
      requestId: string | null;
    }
  | {
      status: "completed";
      externalNoteId: string;
      requestId: string | null;
    };

export type GetTaskProgressResult =
  | {
      status: "pending" | "processing" | "failed";
      requestId: string | null;
    }
  | {
      status: "success";
      externalNoteId: string;
      requestId: string | null;
    };

export type GetNoteDetailResult = SanitizedGetNoteDetail;

export type GetNoteClient = {
  saveLink(url: string): Promise<SaveLinkResult>;
  getTaskProgress(taskId: string): Promise<GetTaskProgressResult>;
  getNoteDetail(externalNoteId: string): Promise<GetNoteDetailResult>;
};

function createProviderUrl(path: string): URL {
  return new URL(path, GETNOTE_BASE_URL);
}

function parseProviderIdentifier(value: unknown): string {
  const result = providerIdentifierSchema.safeParse(value);
  if (!result.success) {
    throw new GetNoteError("invalid_request", { cause: result.error });
  }

  return result.data;
}

function parseRequestedExternalUrl(value: unknown): URL {
  try {
    return parseExternalUrl(value);
  } catch (error) {
    throw new GetNoteError("invalid_request", { cause: error });
  }
}

export function createGetNoteClient(
  inputConfiguration: GetNoteConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): GetNoteClient {
  const configurationResult = getNoteConfigurationSchema.safeParse(inputConfiguration);
  if (!configurationResult.success) {
    throw new GetNoteError("service_unavailable", {
      cause: configurationResult.error,
    });
  }

  const requestProvider = createGetNoteProviderRequester(
    configurationResult.data,
    fetchImplementation,
  );

  return {
    async saveLink(url: string): Promise<SaveLinkResult> {
      const parsedUrl = parseRequestedExternalUrl(url);
      const providerResponse = await requestProvider({
        url: createProviderUrl(SAVE_LINK_PATH),
        method: "POST",
        body: {
          note_type: "link",
          link_url: parsedUrl.toString(),
        },
      });
      const providerDataResult = saveLinkProviderDataSchema.safeParse(providerResponse.data);

      if (!providerDataResult.success) {
        throw new GetNoteError("invalid_provider_response", {
          requestId: providerResponse.requestId,
          cause: providerDataResult.error,
        });
      }

      const providerData = providerDataResult.data;
      if (providerData.kind === "pending") {
        return {
          status: "pending",
          taskId: providerData.taskId,
          requestId: providerResponse.requestId,
        };
      }

      return {
        status: "completed",
        externalNoteId: providerData.externalNoteId,
        requestId: providerResponse.requestId,
      };
    },

    async getTaskProgress(taskId: string): Promise<GetTaskProgressResult> {
      const safeTaskId = parseProviderIdentifier(taskId);
      const providerResponse = await requestProvider({
        url: createProviderUrl(TASK_PROGRESS_PATH),
        method: "POST",
        body: {
          task_id: safeTaskId,
        },
      });
      const providerDataResult = taskProgressProviderDataSchema.safeParse(providerResponse.data);

      if (!providerDataResult.success) {
        throw new GetNoteError("invalid_provider_response", {
          requestId: providerResponse.requestId,
          cause: providerDataResult.error,
        });
      }

      const providerData = providerDataResult.data;
      if (providerData.status === "success") {
        if (providerData.note_id == null) {
          throw new GetNoteError("invalid_provider_response", {
            requestId: providerResponse.requestId,
          });
        }

        return {
          status: "success",
          externalNoteId: providerData.note_id,
          requestId: providerResponse.requestId,
        };
      }

      return {
        status: providerData.status,
        requestId: providerResponse.requestId,
      };
    },

    async getNoteDetail(externalNoteId: string): Promise<GetNoteDetailResult> {
      const safeExternalNoteId = parseProviderIdentifier(externalNoteId);
      const url = createProviderUrl(NOTE_DETAIL_PATH);
      url.searchParams.set("id", safeExternalNoteId);

      const providerResponse = await requestProvider({
        url,
        method: "GET",
      });
      const providerDataResult = noteDetailProviderDataSchema.safeParse(providerResponse.data);

      if (!providerDataResult.success) {
        throw new GetNoteError("invalid_provider_response", {
          requestId: providerResponse.requestId,
          cause: providerDataResult.error,
        });
      }

      if (providerDataResult.data.note.note_id !== safeExternalNoteId) {
        throw new GetNoteError("invalid_provider_response", {
          requestId: providerResponse.requestId,
        });
      }

      return sanitizeGetNoteDetail(providerDataResult.data, providerResponse.requestId);
    },
  };
}

export function createConfiguredGetNoteClient(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: FetchImplementation = fetch,
): GetNoteClient {
  if (environment.GETNOTE_LINK_IMPORT_ENABLED !== "true") {
    throw new GetNoteError("service_unavailable");
  }

  const configurationResult = getNoteConfigurationSchema.safeParse({
    apiKey: environment.GETNOTE_API_KEY,
    clientId: environment.GETNOTE_CLIENT_ID,
  });

  if (!configurationResult.success) {
    throw new GetNoteError("service_unavailable");
  }

  return createGetNoteClient(configurationResult.data, fetchImplementation);
}
