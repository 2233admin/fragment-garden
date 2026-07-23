import {
  getLinkImportProgressSuccessResponseSchema,
  linkImportApiErrorResponseSchema,
  startLinkImportSuccessResponseSchema,
  type GetLinkImportProgressSuccessResponse,
  type LinkImportApiErrorCode,
  type StartLinkImportSuccessResponse,
} from "../validation/link-import-api";

export class LinkImportApiClientError extends Error {
  readonly code: LinkImportApiErrorCode;
  readonly requestId: string | null;

  constructor(code: LinkImportApiErrorCode, message: string, requestId: string | null = null) {
    super(message);
    this.name = "LinkImportApiClientError";
    this.code = code;
    this.requestId = requestId;
  }
}

export interface LinkImportApi {
  start(url: string, signal?: AbortSignal): Promise<StartLinkImportSuccessResponse>;
  getProgress(taskId: string, signal?: AbortSignal): Promise<GetLinkImportProgressSuccessResponse>;
}

type FetchImplementation = typeof fetch;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new LinkImportApiClientError(
      "invalid_provider_response",
      "链接读取服务返回了无法识别的响应。",
    );
  }
}

async function throwApiError(response: Response, body: unknown): Promise<never> {
  const parsed = linkImportApiErrorResponseSchema.safeParse(body);
  if (parsed.success) {
    throw new LinkImportApiClientError(
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.requestId,
    );
  }

  throw new LinkImportApiClientError(
    response.status === 503 ? "service_unavailable" : "invalid_provider_response",
    response.status === 503
      ? "链接读取服务尚未配置或未启用。"
      : "链接读取服务返回了无法识别的错误。",
  );
}

async function postJson(
  fetchImplementation: FetchImplementation,
  path: string,
  body: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<Readonly<{ body: unknown; response: Response }>> {
  try {
    const response = await fetchImplementation(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    return { body: await readJson(response), response };
  } catch (error) {
    if (error instanceof LinkImportApiClientError || signal?.aborted === true) {
      throw error;
    }

    throw new LinkImportApiClientError(
      "network_error",
      "当前无法连接链接读取服务，请检查网络后重试。",
    );
  }
}

export class LinkImportApiClient implements LinkImportApi {
  constructor(private readonly fetchImplementation: FetchImplementation = fetch) {}

  async start(url: string, signal?: AbortSignal): Promise<StartLinkImportSuccessResponse> {
    const { body, response } = await postJson(
      this.fetchImplementation,
      "/api/link-imports/start",
      { url },
      signal,
    );
    if (!response.ok) {
      return throwApiError(response, body);
    }

    const parsed = startLinkImportSuccessResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LinkImportApiClientError(
        "invalid_provider_response",
        "链接读取服务返回了无法识别的开始状态。",
      );
    }

    return parsed.data;
  }

  async getProgress(
    taskId: string,
    signal?: AbortSignal,
  ): Promise<GetLinkImportProgressSuccessResponse> {
    const { body, response } = await postJson(
      this.fetchImplementation,
      "/api/link-imports/progress",
      { taskId },
      signal,
    );
    if (!response.ok) {
      return throwApiError(response, body);
    }

    const parsed = getLinkImportProgressSuccessResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new LinkImportApiClientError(
        "invalid_provider_response",
        "链接读取服务返回了无法识别的任务状态。",
      );
    }

    return parsed.data;
  }
}
