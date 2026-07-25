import { z } from "zod";

export const IMAGE_ANALYSIS_PROMPT_VERSION = "image-analysis-v1" as const;
export const IMAGE_TITLE_MAX_CHARACTERS = 100;
export const IMAGE_SUMMARY_MAX_CHARACTERS = 800;
export const IMAGE_VISIBLE_TEXT_MAX_CHARACTERS = 6_000;

export const imageContentKindSchema = z.enum([
  "screenshot",
  "document",
  "photo",
  "diagram",
  "other",
]);

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function boundedText(maximum: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => unicodeLength(value) <= maximum);
}

export const imageAnalysisResultSchema = z
  .object({
    title: boundedText(IMAGE_TITLE_MAX_CHARACTERS),
    summary: boundedText(IMAGE_SUMMARY_MAX_CHARACTERS),
    visibleText: z
      .string()
      .refine((value) => unicodeLength(value) <= IMAGE_VISIBLE_TEXT_MAX_CHARACTERS)
      .transform((value) => (value.trim().length === 0 ? null : value.trim()))
      .nullable(),
    contentKind: imageContentKindSchema,
  })
  .strict();

export type ImageAnalysisResult = z.infer<typeof imageAnalysisResultSchema>;

export const imageClientRequestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

export const imageAnalysisApiResultSchema = z
  .object({
    requestId: z.string().uuid(),
    clientRequestId: imageClientRequestIdSchema,
    analysis: imageAnalysisResultSchema,
  })
  .strict();

export type ImageAnalysisApiResult = z.infer<typeof imageAnalysisApiResultSchema>;

export const imageAnalysisApiErrorCodeSchema = z.enum([
  "invalid_request",
  "image_analysis_disabled",
  "missing_configuration",
  "unsupported_media_type",
  "file_too_large",
  "invalid_image",
  "authentication_failed",
  "rate_limited",
  "model_unavailable",
  "request_timeout",
  "request_interrupted",
  "response_incomplete",
  "invalid_model_response",
  "provider_error",
]);
export type ImageAnalysisApiErrorCode = z.infer<typeof imageAnalysisApiErrorCodeSchema>;

export const imageAnalysisApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: imageAnalysisApiErrorCodeSchema,
        message: z.string().trim().min(1).max(500),
        requestId: z.string().uuid().nullable(),
      })
      .strict(),
  })
  .strict();
