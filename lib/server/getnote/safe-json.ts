const STRING_IDENTIFIER_FIELDS = new Set(["id", "note_id", "parent_id", "follow_id", "live_id"]);

export const GETNOTE_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
export const LINK_IMPORT_ROUTE_REQUEST_MAX_BYTES = 8 * 1024;

export class TextBodyLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Response body exceeds the ${maxBytes} byte limit`);
    this.name = "TextBodyLimitError";
  }
}

function findJsonStringEnd(text: string, startIndex: number): number {
  let isEscaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const character = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (character === "\\") {
      isEscaped = true;
      continue;
    }

    if (character === '"') {
      return index;
    }
  }

  return -1;
}

function skipWhitespace(text: string, startIndex: number): number {
  let index = startIndex;

  while (index < text.length && /\s/u.test(text[index] ?? "")) {
    index += 1;
  }

  return index;
}

function findIntegerEnd(text: string, startIndex: number): number | null {
  let index = startIndex;

  if (text[index] === "-") {
    index += 1;
  }

  const firstDigit = text[index];
  if (firstDigit === undefined || !/\d/u.test(firstDigit)) {
    return null;
  }

  if (firstDigit === "0") {
    index += 1;
  } else {
    while (index < text.length && /\d/u.test(text[index] ?? "")) {
      index += 1;
    }
  }

  const followingCharacter = text[index];
  if (followingCharacter !== undefined && !/[\s,\]}]/u.test(followingCharacter)) {
    return null;
  }

  return index;
}

/**
 * Quotes only documented integer identifier fields before JSON.parse can
 * round an int64. The scanner skips complete JSON string tokens, so text that
 * merely contains `"id": 123` is never rewritten.
 */
export function protectGetNoteIntegerIdentifiers(text: string): string {
  let cursor = 0;
  let protectedText = "";

  while (cursor < text.length) {
    if (text[cursor] !== '"') {
      protectedText += text[cursor];
      cursor += 1;
      continue;
    }

    const stringEnd = findJsonStringEnd(text, cursor);
    if (stringEnd < 0) {
      return text;
    }

    const rawString = text.slice(cursor, stringEnd + 1);
    protectedText += rawString;

    let decodedString: unknown;
    try {
      decodedString = JSON.parse(rawString);
    } catch {
      return text;
    }

    const nextCursor = stringEnd + 1;
    const colonIndex = skipWhitespace(text, nextCursor);

    if (
      typeof decodedString !== "string" ||
      !STRING_IDENTIFIER_FIELDS.has(decodedString) ||
      text[colonIndex] !== ":"
    ) {
      cursor = nextCursor;
      continue;
    }

    const valueStart = skipWhitespace(text, colonIndex + 1);
    const integerEnd = findIntegerEnd(text, valueStart);

    if (integerEnd === null) {
      cursor = nextCursor;
      continue;
    }

    protectedText += text.slice(nextCursor, valueStart);
    protectedText += `"${text.slice(valueStart, integerEnd)}"`;
    cursor = integerEnd;
  }

  return protectedText;
}

export function parseGetNoteJson(text: string): unknown {
  return JSON.parse(protectGetNoteIntegerIdentifiers(text));
}

export async function readLimitedTextBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (body === null) {
    return "";
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      byteCount += value.byteLength;
      if (byteCount > maxBytes) {
        await reader.cancel();
        throw new TextBodyLimitError(maxBytes);
      }

      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
