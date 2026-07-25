import "server-only";

import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";

export {
  IMAGE_ANALYSIS_PROMPT_VERSION,
  IMAGE_SUMMARY_MAX_CHARACTERS,
  IMAGE_TITLE_MAX_CHARACTERS,
  IMAGE_VISIBLE_TEXT_MAX_CHARACTERS,
  imageAnalysisApiErrorCodeSchema,
  imageAnalysisApiErrorResponseSchema,
  imageAnalysisApiResultSchema,
  imageAnalysisResultSchema,
  imageClientRequestIdSchema,
  imageContentKindSchema,
} from "../../../../validation/media-image-api";
export type {
  ImageAnalysisApiErrorCode,
  ImageAnalysisApiResult,
  ImageAnalysisResult,
} from "../../../../validation/media-image-api";

export const IMAGE_ANALYSIS_MAX_OUTPUT_TOKENS = 1_200;

export const IMAGE_ANALYSIS_RESPONSE_FORMAT: ResponseFormatTextJSONSchemaConfig = {
  type: "json_schema",
  name: "image_analysis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      visibleText: { type: ["string", "null"] },
      contentKind: {
        type: "string",
        enum: ["screenshot", "document", "photo", "diagram", "other"],
      },
    },
    required: ["title", "summary", "visibleText", "contentKind"],
    additionalProperties: false,
  },
};
