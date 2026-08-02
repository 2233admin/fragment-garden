import { describe, expect, it } from "vitest";

import { isMemoryStarTitleVisuallyRedundant } from "../../../components/starmap/memory-star-detail-presentation";

describe("memory star detail presentation", () => {
  it.each([
    {
      contentMarkdown: "666",
      contentType: "text" as const,
      expected: true,
      title: "666",
    },
    {
      contentMarkdown: "第一行\n\n第二行仍然属于正文",
      contentType: "text" as const,
      expected: true,
      title: "第一行",
    },
    {
      contentMarkdown: "一".repeat(31),
      contentType: "text" as const,
      expected: true,
      title: `${"一".repeat(29)}…`,
    },
    {
      contentMarkdown: "正文第一行",
      contentType: "text" as const,
      expected: false,
      title: "用户单独写下的标题",
    },
    {
      contentMarkdown: "example.com",
      contentType: "link" as const,
      expected: false,
      title: "example.com",
    },
  ])("returns $expected for $contentType title '$title'", (testCase) => {
    expect(
      isMemoryStarTitleVisuallyRedundant(
        testCase.contentType,
        testCase.title,
        testCase.contentMarkdown,
      ),
    ).toBe(testCase.expected);
  });
});
