import { z } from "zod";

import { externalUrlSchema } from "./external-url";

export const LINK_IMPORT_TITLE_MAX_LENGTH = 200;
export const LINK_IMPORT_SUMMARY_MAX_LENGTH = 20_000;
export const LINK_IMPORT_SOURCE_CONTENT_MAX_LENGTH = 200_000;

export const linkImportApiErrorCodeSchema = z.enum([
  "invalid_request",
  "service_unavailable",
  "membership_required",
  "rate_limited",
  "quota_exceeded",
  "processing_timeout",
  "platform_unavailable",
  "network_error",
  "provider_processing_failed",
  "invalid_provider_response",
  "unknown_error",
]);

export type LinkImportApiErrorCode = z.infer<typeof linkImportApiErrorCodeSchema>;

const requestIdSchema = z.string().trim().min(1).max(200).nullable();
const externalIdentifierSchema = z.string().trim().min(1).max(200);

function unicodeLimitedString(maxLength: number): z.ZodType<string> {
  return z.string().refine((value) => [...value].length <= maxLength, {
    message: `String must contain at most ${maxLength} Unicode characters`,
  });
}

export const startLinkImportRequestSchema = z
  .object({
    url: externalUrlSchema,
  })
  .strict();

export const getLinkImportProgressRequestSchema = z
  .object({
    taskId: externalIdentifierSchema,
  })
  .strict();

export const completedLinkImportPayloadSchema = z
  .object({
    status: z.literal("completed"),
    externalNoteId: externalIdentifierSchema,
    title: unicodeLimitedString(LINK_IMPORT_TITLE_MAX_LENGTH),
    summary: unicodeLimitedString(LINK_IMPORT_SUMMARY_MAX_LENGTH),
    sourceContent: unicodeLimitedString(LINK_IMPORT_SOURCE_CONTENT_MAX_LENGTH),
    canonicalUrl: externalUrlSchema,
    truncated: z.boolean(),
    requestId: requestIdSchema,
  })
  .strict();

export const startLinkImportSuccessResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("pending"),
      taskId: externalIdentifierSchema,
      requestId: requestIdSchema,
    })
    .strict(),
  completedLinkImportPayloadSchema,
]);

export const getLinkImportProgressSuccessResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.enum(["pending", "processing"]),
      requestId: requestIdSchema,
    })
    .strict(),
  completedLinkImportPayloadSchema,
]);

export const linkImportApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: linkImportApiErrorCodeSchema,
        message: z.string().trim().min(1).max(500),
        requestId: requestIdSchema,
      })
      .strict(),
  })
  .strict();

export type StartLinkImportRequest = z.infer<typeof startLinkImportRequestSchema>;
export type GetLinkImportProgressRequest = z.infer<typeof getLinkImportProgressRequestSchema>;
export type CompletedLinkImportPayload = z.infer<typeof completedLinkImportPayloadSchema>;
export type StartLinkImportSuccessResponse = z.infer<typeof startLinkImportSuccessResponseSchema>;
export type GetLinkImportProgressSuccessResponse = z.infer<
  typeof getLinkImportProgressSuccessResponseSchema
>;
export type LinkImportApiErrorResponse = z.infer<typeof linkImportApiErrorResponseSchema>;
