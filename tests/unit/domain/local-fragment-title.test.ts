import { describe, expect, it } from "vitest";

import { deriveLocalFragmentTitle } from "../../../domain";

describe("deriveLocalFragmentTitle", () => {
  it("uses the first non-empty line", () => {
    expect(deriveLocalFragmentTitle("\n  \n  第一行标题  \n第二行不会进入标题")).toBe("第一行标题");
  });

  it("collapses consecutive whitespace", () => {
    expect(deriveLocalFragmentTitle("  把   多个\t空白  合并  ")).toBe("把 多个 空白 合并");
  });

  it("keeps the final title within 30 graphemes", () => {
    const title = deriveLocalFragmentTitle("一".repeat(31));

    expect(
      Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(title)),
    ).toHaveLength(30);
    expect(title).toBe(`${"一".repeat(29)}…`);
  });

  it("does not break Unicode grapheme clusters", () => {
    const familyEmoji = "👨‍👩‍👧‍👦";
    const title = deriveLocalFragmentTitle(familyEmoji.repeat(31));

    expect(title).toBe(`${familyEmoji.repeat(29)}…`);
  });

  it("returns a fallback for empty content", () => {
    expect(deriveLocalFragmentTitle(" \n\t\r\n ")).toBe("未命名碎片");
  });
});
