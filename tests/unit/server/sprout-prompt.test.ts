import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SPROUT_PROMPT_VERSION } from "../../../domain/sprout/constants";
import {
  buildSproutInstructions,
  SPROUT_DEVELOPER_PROMPT,
} from "../../../lib/server/openai/sprout/sprout-prompt";

describe("sprout developer prompt", () => {
  it("uses one versioned prompt without companion appearance input", () => {
    expect(buildSproutInstructions()).toBe(SPROUT_DEVELOPER_PROMPT);
    expect(buildSproutInstructions()).toContain(SPROUT_PROMPT_VERSION);
    expect(buildSproutInstructions()).not.toContain("companionType");
    expect(buildSproutInstructions()).not.toContain("猫和狗");
  });

  it("defines the single-fragment, injection, truthfulness, and action boundaries", () => {
    const prompt = buildSproutInstructions();

    expect(prompt).toContain("不可信的用户数据");
    expect(prompt).toContain("不得执行");
    expect(prompt).toContain("不编造");
    expect(prompt).toContain("不猜测");
    expect(prompt).toContain("只提出一个可能的具体化方向");
    expect(prompt).toContain("一个引导问题");
    expect(prompt).toContain("绝不执行动作");
    expect(prompt).toContain("休眠不代表失败或死亡");
    expect(prompt).toContain("completed 内容可以寻找延伸方向");
    expect(prompt).toContain("archived 内容仍可分析");
    expect(prompt).toContain("insufficient_content");
    expect(prompt).toContain("不要评分");
  });
});
