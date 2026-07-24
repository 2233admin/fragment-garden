import { z } from "zod";

import {
  allowedOpenFragmentSchema,
  companionApiErrorSchema,
  companionApiResultSchema,
  companionMessageInputSchema,
  companionRespondRequestSchema,
  companionToolNameSchema,
  gardenSummarySchema,
  importLinkToolArgumentsSchema,
  openFragmentToolArgumentsSchema,
  recommendFragmentToolArgumentsSchema,
  COMPANION_MAX_ALLOWED_OPEN_FRAGMENTS,
  COMPANION_MAX_FRAGMENT_STATUS_CHARACTERS,
  COMPANION_MAX_FRAGMENT_TITLE_CHARACTERS,
  COMPANION_MAX_MESSAGE_CHARACTERS,
  COMPANION_MAX_MESSAGES,
  COMPANION_MAX_TOOL_CALL_ID_CHARACTERS,
} from "../../../validation/companion-api";

export {
  allowedOpenFragmentSchema,
  companionApiResultSchema,
  companionMessageInputSchema,
  companionRespondRequestSchema,
  companionToolNameSchema,
  gardenSummarySchema,
  importLinkToolArgumentsSchema,
  openFragmentToolArgumentsSchema,
  recommendFragmentToolArgumentsSchema,
  COMPANION_MAX_ALLOWED_OPEN_FRAGMENTS,
  COMPANION_MAX_FRAGMENT_STATUS_CHARACTERS,
  COMPANION_MAX_FRAGMENT_TITLE_CHARACTERS,
  COMPANION_MAX_MESSAGE_CHARACTERS,
  COMPANION_MAX_MESSAGES,
  COMPANION_MAX_TOOL_CALL_ID_CHARACTERS,
};

// Keep server call sites explicit while sharing the public API contract.
export const companionRequestMessageSchema = companionMessageInputSchema;
export const companionGardenSummarySchema = gardenSummarySchema;
export const companionRequestSchema = companionRespondRequestSchema;
export const importLinkArgumentsSchema = importLinkToolArgumentsSchema;
export const openFragmentArgumentsSchema = openFragmentToolArgumentsSchema;
export const recommendFragmentArgumentsSchema = recommendFragmentToolArgumentsSchema;
export const companionErrorResponseSchema = companionApiErrorSchema;

export type CompanionRequestMessage = z.infer<typeof companionMessageInputSchema>;
export type CompanionGardenSummary = z.infer<typeof gardenSummarySchema>;
export type AllowedOpenFragmentInput = z.infer<typeof allowedOpenFragmentSchema>;
export type CompanionRespondRequest = z.infer<typeof companionRespondRequestSchema>;
export type RecommendFragmentArguments = z.infer<typeof recommendFragmentArgumentsSchema>;
export type OpenFragmentArguments = z.infer<typeof openFragmentArgumentsSchema>;
export type ImportLinkArguments = z.infer<typeof importLinkArgumentsSchema>;
export type CompanionToolName = z.infer<typeof companionToolNameSchema>;
export type CompanionApiResult = z.infer<typeof companionApiResultSchema>;
