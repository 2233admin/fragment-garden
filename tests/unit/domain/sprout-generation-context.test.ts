import { describe, expect, it } from "vitest";

import {
  buildSproutGenerateContext,
  isSproutGenerateContextReady,
} from "../../../domain/sprout/generation-context";
import { SPROUT_GENERATE_MAX_TOTAL_CHARACTERS } from "../../../validation/sprout-generate-api";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

function contextCharacters(context: ReturnType<typeof buildSproutGenerateContext>): number {
  const source = context.source;
  return [
    source.title,
    source.contentMarkdown,
    source.sourceName ?? "",
    ...source.notes.map((note) => note.contentMarkdown),
    ...source.existingSproutTitles,
  ].reduce((total, value) => total + Array.from(value).length, 0);
}

describe("sprout generation context", () => {
  it("keeps the selected note, every user note, source description, and stable child titles", () => {
    const input = {
      id: SOURCE_ID,
      title: "  周末阅读角  ",
      contentMarkdown: "  ## 主体\r\n\r\n先做一次六人试办。  ",
      notes: [
        { contentMarkdown: "  第一条追加  ", createdAt: "2026-07-25T08:00:00.000Z" },
        { contentMarkdown: "第二条追加", createdAt: "2026-07-25T09:00:00.000Z" },
      ],
      sourceType: "link" as const,
      sourceName: "  example.com  ",
      existingSproutTitles: ["第一次活动", "第一次活动", "交换书清单"],
    };

    const result = buildSproutGenerateContext(input);

    expect(result).toEqual({
      source: {
        id: SOURCE_ID,
        title: "周末阅读角",
        contentMarkdown: "## 主体\n\n先做一次六人试办。",
        notes: [
          { contentMarkdown: "第一条追加", createdAt: "2026-07-25T08:00:00.000Z" },
          { contentMarkdown: "第二条追加", createdAt: "2026-07-25T09:00:00.000Z" },
        ],
        sourceType: "link",
        sourceName: "example.com",
        existingSproutTitles: ["第一次活动", "交换书清单"],
      },
    });
    expect(input.notes).toHaveLength(2);
    expect(input.existingSproutTitles).toHaveLength(3);
  });

  it("trims oversized content deterministically without dropping ordinary user notes", () => {
    const notes = Array.from({ length: 8 }, (_, index) => ({
      contentMarkdown: `${index}-${"追".repeat(5_000)}`,
      createdAt: `2026-07-25T${String(index).padStart(2, "0")}:00:00.000Z`,
    }));
    const input = {
      id: SOURCE_ID,
      title: "长内容",
      contentMarkdown: "主".repeat(20_000),
      notes,
      sourceType: "text" as const,
      sourceName: null,
      existingSproutTitles: [],
    };

    const first = buildSproutGenerateContext(input);
    const second = buildSproutGenerateContext(input);

    expect(second).toEqual(first);
    expect(first.source.notes).toHaveLength(notes.length);
    expect(first.source.notes.every((note) => note.contentMarkdown.length > 0)).toBe(true);
    expect(contextCharacters(first)).toBeLessThanOrEqual(SPROUT_GENERATE_MAX_TOTAL_CHARACTERS);
  });

  it("requires readable body or user additions", () => {
    const empty = {
      id: SOURCE_ID,
      title: "只有标题",
      contentMarkdown: "  ",
      notes: [] as const,
      sourceType: "image" as const,
      sourceName: "image.png",
      existingSproutTitles: [] as const,
    };

    expect(isSproutGenerateContextReady(empty)).toBe(false);
    expect(
      isSproutGenerateContextReady({
        ...empty,
        notes: [{ contentMarkdown: "用户补充", createdAt: "2026-07-25T08:00:00.000Z" }],
      }),
    ).toBe(true);
    expect(() => buildSproutGenerateContext(empty)).toThrow();
  });
});
