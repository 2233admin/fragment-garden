import type { LinkImportApiErrorCode } from "../../../validation/link-import-api";

export const GETNOTE_ERROR_MESSAGES: Readonly<Record<LinkImportApiErrorCode, string>> = {
  invalid_request: "请求内容无效，请检查后重试。",
  service_unavailable: "链接读取服务暂未启用或配置不完整。",
  membership_required: "得到大脑账号当前不具备链接读取权限。",
  rate_limited: "链接读取请求过于频繁，请稍后重试。",
  quota_exceeded: "链接读取额度暂时不足，请稍后再试。",
  processing_timeout: "链接处理时间过长，请稍后重试。",
  platform_unavailable: "得到大脑服务暂时不可用，请稍后重试。",
  network_error: "暂时无法连接得到大脑服务，请检查网络后重试。",
  provider_processing_failed: "得到大脑暂时无法读取这个链接。",
  invalid_provider_response: "得到大脑返回了无法识别的结果。",
  unknown_error: "链接读取遇到未知错误，请稍后重试。",
};

export class GetNoteError extends Error {
  readonly code: LinkImportApiErrorCode;
  readonly requestId: string | null;

  constructor(
    code: LinkImportApiErrorCode,
    options: {
      requestId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(GETNOTE_ERROR_MESSAGES[code]);
    this.name = "GetNoteError";
    this.code = code;
    this.requestId = options.requestId ?? null;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function toGetNoteError(error: unknown): GetNoteError {
  if (error instanceof GetNoteError) {
    return error;
  }

  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new GetNoteError("processing_timeout", { cause: error });
  }

  if (error instanceof TypeError) {
    return new GetNoteError("network_error", { cause: error });
  }

  return new GetNoteError("unknown_error", { cause: error });
}

export function getLinkImportErrorHttpStatus(code: LinkImportApiErrorCode): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "membership_required":
      return 403;
    case "rate_limited":
    case "quota_exceeded":
      return 429;
    case "processing_timeout":
      return 504;
    case "platform_unavailable":
    case "network_error":
    case "provider_processing_failed":
    case "invalid_provider_response":
      return 502;
    case "service_unavailable":
      return 503;
    case "unknown_error":
      return 500;
  }
}
