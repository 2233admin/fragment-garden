import { describe, expect, it } from "vitest";

import {
  LinkNoteContentError,
  buildLinkNoteMarkdown,
} from "../../../domain/links/link-note-markdown";

describe("buildLinkNoteMarkdown", () => {
  it("builds deterministic readable sections without dumping system fields", () => {
    const result = buildLinkNoteMarkdown({
      sourceUrl: "https://example.com/article",
      providerTitle: "一篇可读文章",
      summary: "这是摘要。",
      sourceContent: "# 第一节\r\n\r\n正文内容。",
      userTitle: null,
      userNoteMarkdown: "我想稍后继续阅读。",
    });

    expect(result).toEqual({
      title: "一篇可读文章",
      markdown:
        "## 我的补充\n\n我想稍后继续阅读。\n\n## 摘要\n\n这是摘要。\n\n## 正文\n\n# 第一节\n\n正文内容。",
    });
    expect(result.markdown).not.toContain("sourceUrl");
    expect(result.markdown).not.toContain("providerTaskId");
  });

  it("protects the user title and falls back for a generic provider title", () => {
    expect(
      buildLinkNoteMarkdown({
        sourceUrl: "https://www.xiaohongshu.com/explore/one",
        providerTitle: "小红书",
        summary: "一条有效摘要",
        sourceContent: "",
        userTitle: "用户自己的标题",
        userNoteMarkdown: null,
      }).title,
    ).toBe("用户自己的标题");

    expect(
      buildLinkNoteMarkdown({
        sourceUrl: "https://www.xiaohongshu.com/explore/one",
        providerTitle: "小红书",
        summary: "一条有效摘要",
        sourceContent: "",
        userTitle: null,
        userNoteMarkdown: null,
      }).title,
    ).toBe("来自 xiaohongshu.com 的链接");
  });

  it("rejects a provider result that contains only a title", () => {
    expect(() =>
      buildLinkNoteMarkdown({
        sourceUrl: "https://example.com/empty",
        providerTitle: "平台标题",
        summary: "  ",
        sourceContent: "\n",
        userTitle: "用户标题",
        userNoteMarkdown: "用户补充不能伪装成 provider 正文",
      }),
    ).toThrow(LinkNoteContentError);
  });
});
