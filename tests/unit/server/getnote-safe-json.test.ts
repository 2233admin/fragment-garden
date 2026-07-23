import { describe, expect, it } from "vitest";

import {
  parseGetNoteJson,
  protectGetNoteIntegerIdentifiers,
  readLimitedTextBody,
  TextBodyLimitError,
} from "../../../lib/server/getnote/safe-json";

describe("GetNote safe JSON parsing", () => {
  it("preserves documented int64 identifier fields as exact strings", () => {
    const parsed = parseGetNoteJson(`{
      "id": 9223372036854775807,
      "note_id": 1907975006118548200,
      "parent_id": -9223372036854775808,
      "nested": {
        "follow_id": 1907975006118548201,
        "live_id": 1907975006118548202
      },
      "timestamp": 1782962708
    }`);

    expect(parsed).toEqual({
      id: "9223372036854775807",
      note_id: "1907975006118548200",
      parent_id: "-9223372036854775808",
      nested: {
        follow_id: "1907975006118548201",
        live_id: "1907975006118548202",
      },
      timestamp: 1782962708,
    });
  });

  it("understands escaped identifier keys and leaves quoted IDs unchanged", () => {
    expect(parseGetNoteJson(`{"\\u0069d":9223372036854775807,"note_id":"123"}`)).toEqual({
      id: "9223372036854775807",
      note_id: "123",
    });
  });

  it("does not rewrite identifier-shaped text inside escaped strings", () => {
    const input = '{"content":"example: \\"id\\": 9223372036854775807","id":9223372036854775807}';
    const protectedText = protectGetNoteIntegerIdentifiers(input);

    expect(protectedText).toContain('"content":"example: \\"id\\": 9223372036854775807"');
    expect(parseGetNoteJson(protectedText)).toEqual({
      content: 'example: "id": 9223372036854775807',
      id: "9223372036854775807",
    });
  });

  it("does not partially quote decimal or exponent values", () => {
    expect(() => parseGetNoteJson('{"id":1.25}')).not.toThrow();
    expect(() => parseGetNoteJson('{"id":1e20}')).not.toThrow();
    expect(protectGetNoteIntegerIdentifiers('{"id":1.25}')).toBe('{"id":1.25}');
    expect(protectGetNoteIntegerIdentifiers('{"id":1e20}')).toBe('{"id":1e20}');
  });

  it("stops reading a streamed body at the configured byte limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("1234"));
        controller.enqueue(new TextEncoder().encode("5678"));
        controller.close();
      },
    });

    await expect(readLimitedTextBody(stream, 7)).rejects.toBeInstanceOf(TextBodyLimitError);
  });
});
