import { z } from "zod";

import { EXTERNAL_URL_MAX_LENGTH, parseExternalUrl } from "../domain/links/external-url";

export { EXTERNAL_URL_MAX_LENGTH, parseExternalUrl };

export const externalUrlSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(EXTERNAL_URL_MAX_LENGTH))
  .superRefine((value, context) => {
    try {
      parseExternalUrl(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "External URL is invalid",
      });
    }
  });
