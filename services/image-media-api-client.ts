import {
  imageAnalysisApiErrorResponseSchema,
  imageAnalysisApiResultSchema,
  type ImageAnalysisApiErrorCode,
  type ImageAnalysisResult,
} from "../validation/media-image-api";

/** Client-facing error with the server's normalized vocabulary. */
export class ImageMediaApiClientError extends Error {
  readonly code: ImageAnalysisApiErrorCode;

  constructor(code: ImageAnalysisApiErrorCode, message: string) {
    super(message);
    this.name = "ImageMediaApiClientError";
    this.code = code;
  }
}

export type ImageMediaApiResponse = Readonly<{
  requestId: string;
  clientRequestId: string;
  analysis: ImageAnalysisResult;
}>;

function fallbackCode(status: number): ImageAnalysisApiErrorCode {
  if (status === 413) return "file_too_large";
  if (status === 415) return "unsupported_media_type";
  if (status === 429) return "rate_limited";
  return status === 400 ? "invalid_request" : "provider_error";
}

function messageFor(code: ImageAnalysisApiErrorCode): string {
  switch (code) {
    case "image_analysis_disabled":
      return "图片分析尚未启用。图片仍保存在本地。";
    case "missing_configuration":
      return "图片分析暂时没有完成配置。图片仍保存在本地。";
    case "file_too_large":
      return "图片超过 10 MB，仍保存在本地。";
    case "unsupported_media_type":
      return "只支持 PNG、JPEG 和 WebP 图片。";
    case "request_timeout":
      return "图片分析超时了，可以稍后重试。原图仍保存在本地。";
    case "response_incomplete":
      return "图片分析没有完整返回，可以稍后重试。原图仍保存在本地。";
    case "request_interrupted":
      return "上次图片分析没有完成，可以重新分析。原图仍保存在本地。";
    default:
      return "图片分析暂时失败，原图仍保存在本地，可以稍后重试。";
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ImageMediaApiClientError("provider_error", messageFor("provider_error"));
  }
}

export async function analyzeImageMedia(
  file: Blob,
  clientRequestId: string,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<ImageMediaApiResponse> {
  const formData = new FormData();
  const fileName =
    typeof File !== "undefined" && file instanceof File && file.name.length > 0
      ? file.name
      : "image";
  formData.append("file", file, fileName);
  formData.append("clientRequestId", clientRequestId);

  let response: Response;
  try {
    response = await fetchImplementation("/api/media/image/analyze", {
      method: "POST",
      body: formData,
      headers: { "X-Client-Request-Id": clientRequestId },
      signal,
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new ImageMediaApiClientError("provider_error", messageFor("provider_error"));
  }

  const body = await readJson(response);
  if (!response.ok) {
    const parsed = imageAnalysisApiErrorResponseSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error.code : fallbackCode(response.status);
    throw new ImageMediaApiClientError(code, messageFor(code));
  }

  const parsed = imageAnalysisApiResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new ImageMediaApiClientError(
      "invalid_model_response",
      messageFor("invalid_model_response"),
    );
  }
  return parsed.data;
}
