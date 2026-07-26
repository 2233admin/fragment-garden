import { $isLinkNode, LinkNode } from "@lexical/link";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $getRoot, createEditor } from "lexical";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MVP_MARKDOWN_TRANSFORMERS } from "../../../components/fragments/RichTextEditor";
import { MarkdownContent } from "../../../components/fragments/MarkdownContent";

function roundTrip(markdown: string): Readonly<{ markdown: string; linkUrls: string[] }> {
  const editor = createEditor({
    namespace: "rich-text-security-test",
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
    onError(error) {
      throw error;
    },
  });
  let result = "";
  let linkUrls: string[] = [];
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, MVP_MARKDOWN_TRANSFORMERS);
      linkUrls = $getRoot()
        .getAllTextNodes()
        .flatMap((node) => {
          const parent = node.getParent();
          return $isLinkNode(parent) ? [parent.getURL()] : [];
        });
      result = $convertToMarkdownString(MVP_MARKDOWN_TRANSFORMERS);
    },
    { discrete: true },
  );
  return { markdown: result, linkUrls };
}

describe("rich text Markdown security", () => {
  it("round-trips safe links without restoring dangerous link nodes", () => {
    const oversizedUrl = `https://example.com/${"a".repeat(2_100)}`;
    const result = roundTrip(
      [
        "[安全链接](https://example.com/note)",
        "[脚本链接](javascript:alert)",
        "[数据链接](data:text/html,hello)",
        `[超长链接](${oversizedUrl})`,
      ].join("\n\n"),
    );

    expect(result.linkUrls).toEqual(["https://example.com/note"]);
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, { content: result.markdown }),
    );
    expect(markup).toContain('href="https://example.com/note"');
    expect(markup).toContain("脚本链接");
    expect(markup).toContain("数据链接");
    expect(markup).toContain("超长链接");
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("data:text/html");
    expect(markup).not.toContain(oversizedUrl);
  });

  it("keeps raw HTML inert through editor import and export", () => {
    const result = roundTrip(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n普通正文',
    );

    expect(result.linkUrls).toEqual([]);
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, { content: result.markdown }),
    );
    expect(markup).toContain("普通正文");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("onerror=");
  });
});
