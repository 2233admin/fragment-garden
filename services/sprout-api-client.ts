import {
  sproutApiErrorSchema,
  sproutApiResultSchema,
  type SproutAnalyzeRequest,
  type SproutApiErrorCode,
  type SproutApiResult,
} from "../validation/sprout-api";

export class SproutApiClientError extends Error {
  readonly code: SproutApiErrorCode;

  constructor(code: SproutApiErrorCode, message: string) {
    super(message);
    this.name = "SproutApiClientError";
    this.code = code;
  }
}

export interface SproutApi {
  analyze(input: SproutAnalyzeRequest, signal?: AbortSignal): Promise<SproutApiResult>;
}

function fallbackErrorCode(status: number): SproutApiErrorCode {
  if (status === 413) {
    return "content_too_large";
  }

  if (status === 429) {
    return "rate_limited";
  }

  return status === 400 ? "request_validation_failed" : "provider_error";
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SproutApiClientError("invalid_model_response", "伙伴暂时没有返回可读取的发芽结果。");
  }
}

export class SproutApiClient implements SproutApi {
  constructor(
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly createRequestId: () => string = () => globalThis.crypto.randomUUID(),
  ) {}

  async analyze(input: SproutAnalyzeRequest, signal?: AbortSignal): Promise<SproutApiResult> {
    let response: Response;

    try {
      response = await this.fetchImplementation("/api/sprout/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-Id": this.createRequestId(),
        },
        body: JSON.stringify(input),
        signal,
      });
    } catch (error) {
      if (signal?.aborted === true) {
        throw error;
      }

      throw new SproutApiClientError("provider_error", "伙伴暂时没能连接到发芽服务。");
    }

    const body = await readResponseBody(response);

    if (!response.ok) {
      const parsedError = sproutApiErrorSchema.safeParse(body);
      const code = parsedError.success
        ? parsedError.data.error.code
        : fallbackErrorCode(response.status);
      throw new SproutApiClientError(code, sproutErrorMessage(code));
    }

    const parsedResult = sproutApiResultSchema.safeParse(body);
    if (!parsedResult.success) {
      throw new SproutApiClientError(
        "invalid_model_response",
        "伙伴暂时没有返回可识别的发芽结果。",
      );
    }

    return parsedResult.data;
  }
}

export function sproutErrorMessage(code: SproutApiErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "现在请求有些多，可以稍后再让伙伴看看。";
    case "request_timeout":
      return "伙伴这次看得有些久，可以重新试一次。";
    case "content_too_large":
      return "这条内容暂时太长，补充一段更聚焦的背景后可以再试。";
    default:
      return "伙伴暂时没能找到更具体的方向。你可以先补充一点内容，或者稍后再试。";
  }
}
