import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "../../../components/fragments/MarkdownContent";

describe("MarkdownContent", () => {
  it("renders the supported reading structure without executing raw HTML", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: [
          "# 花园笔记",
          "",
          "- 第一条",
          "- **第二条**",
          "",
          '<script data-secret="hidden">window.evil = true</script>',
          '<img src=x onerror="window.evil = true">',
        ].join("\n"),
      }),
    );

    expect(markup).toContain("<h1");
    expect(markup).toContain("花园笔记");
    expect(markup).toContain("<ul");
    expect(markup).toContain("<strong");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("data-secret");
    expect(markup).not.toContain("onerror");
  });

  it("keeps safe links and removes dangerous URL protocols", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: [
          "[安全来源](https://example.com/note)",
          "",
          "[危险来源](javascript:alert('no'))",
        ].join("\n"),
      }),
    );

    expect(markup).toContain('href="https://example.com/note"');
    expect(markup).toContain("安全来源");
    expect(markup).toContain("危险来源");
    expect(markup).not.toContain("javascript:");
  });
});
