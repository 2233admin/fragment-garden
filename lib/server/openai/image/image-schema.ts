import "server-only";

import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";

export {
  IMAGE_ANALYSIS_PROMPT_VERSION,
  IMAGE_MARKDOWN_MAX_CHARACTERS,
  IMAGE_TITLE_MAX_CHARACTERS,
  imageAnalysisApiErrorCodeSchema,
  imageAnalysisApiErrorResponseSchema,
  imageAnalysisApiResultSchema,
  imageAnalysisResultSchema,
  imageClientRequestIdSchema,
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
      title: { type: "string", minLength: 1, maxLength: 100 },
      markdown: { type: "string", minLength: 1, maxLength: 8_000 },
    },
    required: ["title", "markdown"],
    additionalProperties: false,
  },
};
