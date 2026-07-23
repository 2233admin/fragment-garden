import { describe, expect, it } from "vitest";

import { deriveLocalLinkTitle, normalizeExternalUrl } from "../../../domain/links/external-url";
import {
  EXTERNAL_URL_MAX_LENGTH,
  externalUrlSchema,
  parseExternalUrl,
} from "../../../validation/external-url";

describe("external URL validation", () => {
  it.each([
    "http://example.com/article",
    "https://example.com/article",
    "https://xhslink.com/a/abc",
    "https://v.douyin.com/abc/",
    "https://mp.weixin.qq.com/s?__biz=example",
    "https://www.bilibili.com/video/BV1example",
    "https://www.xiaoyuzhoufm.com/episode/example",
    "https://[2606:4700:4700::1111]/dns-query",
    "https://[2001:4860:4860::8888]/dns-query",
  ])("accepts a public HTTP or HTTPS URL: %s", (sourceUrl) => {
    expect(externalUrlSchema.parse(sourceUrl)).toBe(sourceUrl);
    expect(parseExternalUrl(sourceUrl)).toBeInstanceOf(URL);
  });

  it("returns a safely trimmed string", () => {
    expect(externalUrlSchema.parse(" \n https://example.com/article \t")).toBe(
      "https://example.com/article",
    );
  });

  it.each([
    "file:///tmp/private.txt",
    "data:text/plain,private",
    "javascript:alert(1)",
    "ftp://example.com/file",
    "https://user@example.com/private",
    "https://user:password@example.com/private",
    "http://localhost/private",
    "http://app.localhost/private",
    "http://home.arpa/private",
    "http://router.home.arpa/private",
    "http://intranet/private",
    "http://127.0.0.1/private",
    "http://127.20.30.40/private",
    "http://0.0.0.0/private",
    "http://10.0.0.1/private",
    "http://172.20.0.1/private",
    "http://192.168.1.1/private",
    "http://169.254.1.1/private",
    "http://[::1]/private",
    "http://[fc00::1]/private",
    "http://[fe80::1]/private",
    "http://[fec0::1]/private",
    "http://[feff::1]/private",
    "http://[::7f00:1]/private",
    "http://[::a00:1]/private",
    "http://[::ffff:127.0.0.1]/private",
    "http://[64:ff9b::7f00:1]/private",
    "http://[2002:7f00:1::]/private",
    "http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/private",
    "http://[2606:4700::5efe:7f00:1]/private",
  ])("rejects an unsafe or unsupported URL: %s", (sourceUrl) => {
    expect(() => externalUrlSchema.parse(sourceUrl)).toThrow();
  });

  it("rejects malformed and overlong URLs", () => {
    expect(() => externalUrlSchema.parse("not a URL")).toThrow();
    expect(() =>
      externalUrlSchema.parse(`https://example.com/${"a".repeat(EXTERNAL_URL_MAX_LENGTH)}`),
    ).toThrow();
  });
});

describe("normalizeExternalUrl", () => {
  it("normalizes host, port, fragment, trailing slash, tracking data, and query order", () => {
    expect(
      normalizeExternalUrl(
        " HTTPS://EXAMPLE.COM:443/article/?utm_source=newsletter&token=keep&b=2&a=1#section ",
      ),
    ).toBe("https://example.com/article?a=1&b=2&token=keep");
  });

  it("removes only explicitly allowed tracking parameters", () => {
    expect(
      normalizeExternalUrl(
        "https://example.com/?utm_medium=email&utm_campaign=launch&utm_term=garden&utm_content=card&fbclid=one&gclid=two&share_token=keep",
      ),
    ).toBe("https://example.com?share_token=keep");
  });

  it("preserves platform parameters that may be required by shared links", () => {
    expect(
      normalizeExternalUrl(
        "https://www.xiaohongshu.com/explore/item/?xsec_token=abc&xsec_source=pc_share",
      ),
    ).toBe("https://www.xiaohongshu.com/explore/item?xsec_source=pc_share&xsec_token=abc");
  });

  it("keeps meaningfully different unknown parameters distinct", () => {
    const first = normalizeExternalUrl("https://example.com/article?item=one");
    const second = normalizeExternalUrl("https://example.com/article?item=two");

    expect(first).not.toBe(second);
  });

  it("returns a stable result for equivalent inputs", () => {
    const first = normalizeExternalUrl("https://example.com/article/?b=2&utm_source=one&a=1#first");
    const second = normalizeExternalUrl(
      "https://EXAMPLE.com:443/article?a=1&b=2&utm_source=two#second",
    );

    expect(first).toBe(second);
  });
});

describe("deriveLocalLinkTitle", () => {
  it("uses a readable hostname without exposing the full URL", () => {
    expect(deriveLocalLinkTitle("https://www.example.com/very/long/path?private=value")).toBe(
      "来自 example.com 的链接",
    );
  });

  it("falls back for an invalid URL", () => {
    expect(deriveLocalLinkTitle("not a URL")).toBe("链接碎片");
  });

  it("limits the temporary title to 60 Unicode characters", () => {
    const title = deriveLocalLinkTitle(`https://${"a".repeat(60)}.example.com/article`);

    expect(Array.from(title).length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });
});
