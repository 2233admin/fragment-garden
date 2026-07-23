import { z } from "zod";

import type { TextAddedEventPayload } from "../domain";

export const textAddedEventPayloadSchema: z.ZodType<TextAddedEventPayload> = z
  .object({
    text: z.string().trim().min(1),
  })
  .strict();

export function parseTextAddedEventPayload(payload: unknown): TextAddedEventPayload {
  return textAddedEventPayloadSchema.parse(payload);
}

export function safelyParseTextAddedEventPayload(payload: unknown): TextAddedEventPayload | null {
  const result = textAddedEventPayloadSchema.safeParse(payload);
  return result.success ? result.data : null;
}
