import { describe, expect, it } from "vitest";

import {
  getCasualLine,
  getCompanionNpcMainOptions,
  getCompanionNpcMoreOptions,
  getGardenSummaryLines,
  getGrowthRuleLines,
  getLifecycleRuleLines,
  transitionCompanionNpcScreen,
  type CompanionNpcAction,
  type CompanionNpcGardenSummary,
  type CompanionNpcScreen,
} from "../../../domain/companion/npc";

const EMPTY_SUMMARY: CompanionNpcGardenSummary = {
  activeCount: 0,
  dormantCount: 0,
  completedCount: 0,
  archivedCount: 0,
};

function action(type: CompanionNpcAction["type"]): CompanionNpcAction {
  if (type === "open_dormant_fragment") {
    return { type, fragmentId: "fragment-1" };
  }

  return { type } as CompanionNpcAction;
}

describe("companion NPC menu model", () => {
  it("exposes exactly the five main options in product order", () => {
    expect(getCompanionNpcMainOptions()).toEqual([
      { action: { type: "recommend_fragment" }, label: "帮我找一株值得重新看看的植物" },
      { action: { type: "garden_summary" }, label: "看看我的花园近况" },
      { action: { type: "create_fragment" }, label: "帮我种下一个新想法" },
      { action: { type: "more" }, label: "更多" },
      { action: { type: "leave" }, label: "离开" },
    ]);
  });

  it("exposes the fixed more menu and does not share a mutable array", () => {
    const first = getCompanionNpcMoreOptions();
    const second = getCompanionNpcMoreOptions();

    expect(first).toEqual([
      { action: { type: "dormant_list" }, label: "看看哪些植物正在休眠" },
      { action: { type: "growth_rules" }, label: "告诉我植物为什么会成长" },
      { action: { type: "lifecycle_rules" }, label: "告诉我休眠、完成和封存是什么" },
      { action: { type: "casual_line" }, label: "只是来看看你" },
      { action: { type: "back" }, label: "返回" },
      { action: { type: "leave" }, label: "离开" },
    ]);
    expect(first).toBe(second);
  });
});

describe("companion NPC screen transitions", () => {
  it("follows the finite main and more navigation", () => {
    expect(transitionCompanionNpcScreen("main", action("more"))).toBe("more");
    expect(transitionCompanionNpcScreen("more", action("back"))).toBe("main");
    expect(transitionCompanionNpcScreen("more", action("dormant_list"))).toBe("dormant_list");
    expect(transitionCompanionNpcScreen("more", action("growth_rules"))).toBe("growth_rules");
    expect(transitionCompanionNpcScreen("more", action("lifecycle_rules"))).toBe("lifecycle_rules");
    expect(transitionCompanionNpcScreen("more", action("casual_line"))).toBe("casual_line");
  });

  it("enters results deterministically and closes for side-effect actions", () => {
    expect(transitionCompanionNpcScreen("main", action("recommend_fragment"))).toBe(
      "recommendation_result",
    );
    expect(transitionCompanionNpcScreen("recommendation_result", action("back"))).toBe("main");
    expect(
      transitionCompanionNpcScreen("recommendation_result", action("dismiss_recommendation")),
    ).toBe("recommendation_result");
    expect(
      transitionCompanionNpcScreen("recommendation_result", action("open_recommendation")),
    ).toBe(null);
    expect(
      transitionCompanionNpcScreen("dormant_list", action("open_dormant_fragment")),
    ).toBeNull();
  });

  it("closes from every screen and ignores stale actions", () => {
    const screens: readonly CompanionNpcScreen[] = [
      "main",
      "more",
      "garden_summary",
      "dormant_list",
      "growth_rules",
      "lifecycle_rules",
      "casual_line",
      "recommendation_result",
    ];

    for (const screen of screens) {
      expect(transitionCompanionNpcScreen(screen, action("leave"))).toBeNull();
    }

    expect(transitionCompanionNpcScreen("main", action("back"))).toBe("main");
    expect(transitionCompanionNpcScreen("growth_rules", action("dormant_list"))).toBe(
      "growth_rules",
    );
  });
});

describe("companion NPC fixed copy", () => {
  it("uses the empty garden template", () => {
    expect(getGardenSummaryLines(EMPTY_SUMMARY)).toEqual([
      "花园现在还是空的。种下第一个想法后，这里就会慢慢有变化。",
    ]);
    expect(getCasualLine(EMPTY_SUMMARY)).toContain("等你有想法");
  });

  it("renders current counts without mutating the summary", () => {
    const summary: CompanionNpcGardenSummary = {
      activeCount: 2,
      dormantCount: 1,
      completedCount: 3,
      archivedCount: 1,
    };
    const before = { ...summary };

    expect(getGardenSummaryLines(summary)).toEqual([
      "现在有 2 株植物正在生长，还有 1 株正在休息。",
      "你已经让 3 株植物永久盛开了。",
      "还有 1 株内容已经封存，仍然保留在卡片里。",
    ]);
    expect(summary).toEqual(before);
  });

  it("uses deterministic casual-line priority", () => {
    expect(getCasualLine({ ...EMPTY_SUMMARY, activeCount: 1 })).toBe(
      "花园今天也有一些植物在慢慢生长。",
    );
    expect(getCasualLine({ ...EMPTY_SUMMARY, completedCount: 1, activeCount: 1 })).toBe(
      "已经盛开的植物会一直留在这里。",
    );
    expect(getCasualLine({ ...EMPTY_SUMMARY, dormantCount: 1, completedCount: 1 })).toBe(
      "有些植物正在休息。它们没有消失，只是在等你再次想起。",
    );
  });

  it("keeps growth and lifecycle explanations fixed and bounded", () => {
    const growth = getGrowthRuleLines();
    const lifecycle = getLifecycleRuleLines();

    expect(growth).toHaveLength(2);
    expect(growth.join("\n")).toContain("同类行为在同一天只计一次");
    expect(growth.join("\n")).toContain("写下一步");
    expect(growth.join("\n")).toContain("图片与语音尚未完成");
    expect(lifecycle.join("\n")).toContain("72 小时");
    expect(lifecycle.join("\n")).toContain("不会死亡");
    expect(lifecycle.join("\n")).toContain("永久盛开");
    expect(lifecycle.join("\n")).toContain("释放植物槽位");
  });

  it("has identical copy regardless of any caller-side companion choice", () => {
    const summary = { ...EMPTY_SUMMARY, activeCount: 1 };
    expect(getGardenSummaryLines(summary)).toEqual(getGardenSummaryLines(summary));
    expect(getCasualLine(summary)).toBe(getCasualLine(summary));
    expect(getGrowthRuleLines()).toEqual(getGrowthRuleLines());
    expect(getLifecycleRuleLines()).toEqual(getLifecycleRuleLines());
  });
});
