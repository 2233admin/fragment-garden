import "server-only";

import { parseExternalUrl } from "../../../validation/external-url";
import {
  LINK_IMPORT_SOURCE_CONTENT_MAX_LENGTH,
  LINK_IMPORT_SUMMARY_MAX_LENGTH,
  LINK_IMPORT_TITLE_MAX_LENGTH,
} from "../../../validation/link-import-api";
import { GetNoteError } from "./getnote-errors";
import type { NoteDetailProviderData } from "./getnote-schemas";

export type SanitizedGetNoteDetail = {
  externalNoteId: string;
  title: string;
  summary: string;
  sourceContent: string;
  canonicalUrl: string;
  truncated: boolean;
  requestId: string | null;
};

function truncateUnicodeText(
  value: string,
  maxLength: number,
): { value: string; truncated: boolean } {
  if (value.length <= maxLength) {
    return { value, truncated: false };
  }

  let result = "";
  let characterCount = 0;

  for (const character of value) {
    if (characterCount === maxLength) {
      return { value: result, truncated: true };
    }

    result += character;
    characterCount += 1;
  }

  return { value: result, truncated: false };
}

export function sanitizeGetNoteDetail(
  providerData: NoteDetailProviderData,
  requestId: string | null,
): SanitizedGetNoteDetail {
  const note = providerData.note;
  const title = truncateUnicodeText(note.title.trim(), LINK_IMPORT_TITLE_MAX_LENGTH).value;
  const summary = truncateUnicodeText(
    note.web_page.excerpt.trim(),
    LINK_IMPORT_SUMMARY_MAX_LENGTH,
  ).value;
  const sourceContentResult = truncateUnicodeText(
    note.web_page.content,
    LINK_IMPORT_SOURCE_CONTENT_MAX_LENGTH,
  );

  let canonicalUrl: string;
  try {
    canonicalUrl = parseExternalUrl(note.web_page.url).toString();
  } catch (error) {
    throw new GetNoteError("invalid_provider_response", {
      requestId,
      cause: error,
    });
  }

  return {
    externalNoteId: note.note_id,
    title,
    summary,
    sourceContent: sourceContentResult.value,
    canonicalUrl,
    truncated: sourceContentResult.truncated,
    requestId,
  };
}
