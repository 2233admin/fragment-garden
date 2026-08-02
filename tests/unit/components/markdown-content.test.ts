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
          '<iframe src="https://example.com"></iframe>',
          '<button onclick="window.evil = true">危险按钮</button>',
          "<svg><script>window.evil = true</script></svg>",
          '<div title="unterminated">未关闭标签',
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
    expect(markup).not.toContain("onclick");
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("<svg");
  });

  it("keeps safe links and removes dangerous or oversized URL protocols", () => {
    const oversizedUrl = `https://example.com/${"a".repeat(2_100)}`;
    const markup = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: [
          "[安全来源](https://example.com/note)",
          "",
          "[危险来源](javascript:alert('no'))",
          "",
          "[数据来源](data:text/html,<script>alert('no')</script>)",
          "",
          `[超长来源](${oversizedUrl})`,
        ].join("\n"),
      }),
    );

    expect(markup).toContain('href="https://example.com/note"');
    expect(markup).toContain("安全来源");
    expect(markup).toContain("危险来源");
    expect(markup).toContain("数据来源");
    expect(markup).toContain("超长来源");
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("data:text/html");
    expect(markup).not.toContain(oversizedUrl);
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('target="_blank"');
  });
});
