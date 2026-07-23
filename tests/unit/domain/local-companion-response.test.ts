import { describe, expect, it, vi } from "vitest";

import {
  COMPANION_DORMANCY_RESPONSE,
  COMPANION_FALLBACK_RESPONSE,
  COMPANION_GROWTH_RESPONSE,
  COMPANION_HELP_RESPONSE,
  LocalCompanionResponseEngine,
} from "../../../domain/companion/local-response-engine";

describe("LocalCompanionResponseEngine", () => {
  const engine = new LocalCompanionResponseEngine();

  it.each(["怎么使用？", "这里能做什么？", "怎么种植物？"])(
    "answers help intent deterministically for %s",
    (message) => {
      expect(engine.respond({ message })).toEqual({
        message: COMPANION_HELP_RESPONSE,
        action: null,
      });
    },
  );

  it.each(["植物为什么长大？", "怎么让它开花？", "成长分是什么？"])(
    "answers growth intent without claiming unfinished inputs are available for %s",
    (message) => {
      const response = engine.respond({ message });

      expect(response).toEqual({
        message: COMPANION_GROWTH_RESPONSE,
        action: null,
      });
      expect(response.message).toContain("当前版本主要支持文字补充");
      expect(response.message).toContain("链接、图片和语音将在后续版本加入");
    },
  );

  it.each(["为什么植物休眠？", "休眠会消失吗？", "植物会死吗？"])(
    "explains the real 72-hour dormancy rule for %s",
    (message) => {
      expect(engine.respond({ message })).toEqual({
        message: COMPANION_DORMANCY_RESPONSE,
        action: null,
      });
      expect(COMPANION_DORMANCY_RESPONSE).toContain("72 小时");
      expect(COMPANION_DORMANCY_RESPONSE).toContain("不会死亡");
    },
  );

  it.each(["推荐一条以前的想法", "我该看看什么？", "带我回顾一下"])(
    "returns only a recommendation action for %s",
    (message) => {
      expect(engine.respond({ message })).toMatchObject({
        action: { type: "RECOMMEND_FRAGMENT" },
      });
    },
  );

  it("uses the same engine behavior regardless of the selected companion appearance", () => {
    const catResponse = engine.respond({ message: "植物为什么休眠？" });
    const dogResponse = new LocalCompanionResponseEngine().respond({
      message: "植物为什么休眠？",
    });

    expect(catResponse).toEqual(dogResponse);
  });

  it("returns a bounded fallback instead of pretending to be a general AI", () => {
    expect(engine.respond({ message: "帮我写一首歌" })).toEqual({
      message: COMPANION_FALLBACK_RESPONSE,
      action: null,
    });
  });

  it("does not make a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    engine.respond({ message: "推荐一条以前的想法" });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
