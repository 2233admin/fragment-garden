import "server-only";

import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";

import {
  SPROUT_GENERATE_MAX_MARKDOWN_CHARACTERS,
  SPROUT_GENERATE_MAX_TITLE_CHARACTERS,
  sproutGeneratedNoteSchema,
} from "../../../../validation/sprout-generate-api";

export { sproutGeneratedNoteSchema };

export const SPROUT_GENERATE_RESPONSE_FORMAT: ResponseFormatTextJSONSchemaConfig = {
  type: "json_schema",
  name: "sprout_generated_note",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        minLength: 1,
        maxLength: SPROUT_GENERATE_MAX_TITLE_CHARACTERS,
      },
      markdown: {
        type: "string",
        minLength: 1,
        maxLength: SPROUT_GENERATE_MAX_MARKDOWN_CHARACTERS,
      },
    },
    required: ["title", "markdown"],
    additionalProperties: false,
  },
};
