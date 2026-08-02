import {
  sproutGenerateApiErrorSchema,
  sproutGeneratedNoteSchema,
  type SproutGenerateApiErrorCode,
  type SproutGenerateRequest,
  type SproutGeneratedNote,
} from "../validation/sprout-generate-api";

export class SproutGenerationApiClientError extends Error {
  constructor(
    readonly code: SproutGenerateApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SproutGenerationApiClientError";
  }
}

function fallbackErrorCode(status: number): SproutGenerateApiErrorCode {
  if (status === 413) return "content_too_large";
  if (status === 429) return "rate_limited";
  return status === 400 ? "request_validation_failed" : "provider_error";
}

export function sproutGenerationErrorMessage(code: SproutGenerateApiErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "现在请求有些多，这条笔记没有被修改，可以稍后再试。";
    case "request_timeout":
    case "response_incomplete":
      return "这次发芽没有完整结束，没有创建新笔记，可以重新试一次。";
    case "content_too_large":
      return "这条笔记暂时太长，没有创建新内容。可以先整理得更聚焦一些。";
    default:
      return "这次没能生成新的笔记，没有修改原内容，可以稍后重试。";
  }
}

export class SproutGenerationApiClient {
  constructor(
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly createRequestId: () => string = () => globalThis.crypto.randomUUID(),
  ) {}

  async generate(input: SproutGenerateRequest, signal?: AbortSignal): Promise<SproutGeneratedNote> {
    let response: Response;
    try {
      response = await this.fetchImplementation("/api/sprout/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Request-Id": this.createRequestId(),
        },
        body: JSON.stringify(input),
        signal,
      });
    } catch (error) {
      if (signal?.aborted === true) throw error;
      throw new SproutGenerationApiClientError(
        "provider_error",
        sproutGenerationErrorMessage("provider_error"),
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SproutGenerationApiClientError(
        "invalid_model_response",
        sproutGenerationErrorMessage("invalid_model_response"),
      );
    }

    if (!response.ok) {
      const parsedError = sproutGenerateApiErrorSchema.safeParse(body);
      const code = parsedError.success
        ? parsedError.data.error.code
        : fallbackErrorCode(response.status);
      throw new SproutGenerationApiClientError(code, sproutGenerationErrorMessage(code));
    }

    const parsedResult = sproutGeneratedNoteSchema.safeParse(body);
    if (!parsedResult.success) {
      throw new SproutGenerationApiClientError(
        "invalid_model_response",
        sproutGenerationErrorMessage("invalid_model_response"),
      );
    }
    return parsedResult.data;
  }
}
