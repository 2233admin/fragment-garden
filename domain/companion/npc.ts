/**
 * The rule-driven companion surface is deliberately independent of the
 * companion's visual appearance.  UI code can use these values to render a
 * finite NPC conversation without creating a chat transcript or contacting
 * an AI provider.
 */

export type CompanionNpcScreen =
  | "main"
  | "more"
  | "garden_summary"
  | "dormant_list"
  | "growth_rules"
  | "lifecycle_rules"
  | "casual_line"
  | "recommendation_result";

export type CompanionNpcAction =
  | Readonly<{ type: "recommend_fragment" }>
  | Readonly<{ type: "garden_summary" }>
  | Readonly<{ type: "create_fragment" }>
  | Readonly<{ type: "more" }>
  | Readonly<{ type: "leave" }>
  | Readonly<{ type: "dormant_list" }>
  | Readonly<{ type: "growth_rules" }>
  | Readonly<{ type: "lifecycle_rules" }>
  | Readonly<{ type: "casual_line" }>
  | Readonly<{ type: "back" }>
  | Readonly<{ type: "open_recommendation" }>
  | Readonly<{ type: "dismiss_recommendation" }>
  | Readonly<{ type: "open_dormant_fragment"; fragmentId: string }>;

export type CompanionNpcOption = Readonly<{
  action: CompanionNpcAction;
  label: string;
}>;

export type CompanionNpcGardenSummary = Readonly<{
  activeCount: number;
  dormantCount: number;
  completedCount: number;
  archivedCount: number;
}>;

const MAIN_OPTIONS: readonly CompanionNpcOption[] = Object.freeze([
  Object.freeze({
    action: { type: "recommend_fragment" } as const,
    label: "帮我找一株值得重新看看的植物",
  }),
  Object.freeze({
    action: { type: "garden_summary" } as const,
    label: "看看我的花园近况",
  }),
  Object.freeze({
    action: { type: "create_fragment" } as const,
    label: "帮我种下一个新想法",
  }),
  Object.freeze({
    action: { type: "more" } as const,
    label: "更多",
  }),
  Object.freeze({
    action: { type: "leave" } as const,
    label: "离开",
  }),
]);

const MORE_OPTIONS: readonly CompanionNpcOption[] = Object.freeze([
  Object.freeze({
    action: { type: "dormant_list" } as const,
    label: "看看哪些植物正在休眠",
  }),
  Object.freeze({
    action: { type: "growth_rules" } as const,
    label: "告诉我植物为什么会成长",
  }),
  Object.freeze({
    action: { type: "lifecycle_rules" } as const,
    label: "告诉我休眠、完成和封存是什么",
  }),
  Object.freeze({
    action: { type: "casual_line" } as const,
    label: "只是来看看你",
  }),
  Object.freeze({
    action: { type: "back" } as const,
    label: "返回",
  }),
  Object.freeze({
    action: { type: "leave" } as const,
    label: "离开",
  }),
]);

/** Returns the fixed first-level options in their product order. */
export function getCompanionNpcMainOptions(): readonly CompanionNpcOption[] {
  return MAIN_OPTIONS;
}

/** Returns the fixed secondary options in their product order. */
export function getCompanionNpcMoreOptions(): readonly CompanionNpcOption[] {
  return MORE_OPTIONS;
}

/**
 * Applies one finite NPC action.  `null` means the caller should close the
 * NPC surface (for example, before opening a shared Fragment detail dialog).
 * Actions that do not belong to the current screen are ignored deliberately;
 * this keeps stale button events from moving the conversation to an invalid
 * state.
 */
export function transitionCompanionNpcScreen(
  screen: CompanionNpcScreen,
  action: CompanionNpcAction,
): CompanionNpcScreen | null {
  if (action.type === "leave") {
    return null;
  }

  switch (screen) {
    case "main":
      switch (action.type) {
        case "recommend_fragment":
          return "recommendation_result";
        case "garden_summary":
          return "garden_summary";
        case "create_fragment":
          return "main";
        case "more":
          return "more";
        default:
          return screen;
      }

    case "more":
      switch (action.type) {
        case "dormant_list":
          return "dormant_list";
        case "growth_rules":
          return "growth_rules";
        case "lifecycle_rules":
          return "lifecycle_rules";
        case "casual_line":
          return "casual_line";
        case "back":
          return "main";
        default:
          return screen;
      }

    case "garden_summary":
      switch (action.type) {
        case "dormant_list":
          return "dormant_list";
        case "create_fragment":
          return "main";
        case "back":
          return "main";
        default:
          return screen;
      }

    case "dormant_list":
      switch (action.type) {
        case "open_dormant_fragment":
          return null;
        case "back":
          return "main";
        default:
          return screen;
      }

    case "growth_rules":
      switch (action.type) {
        case "lifecycle_rules":
          return "lifecycle_rules";
        case "back":
          return "main";
        default:
          return screen;
      }

    case "lifecycle_rules":
      switch (action.type) {
        case "growth_rules":
          return "growth_rules";
        case "back":
          return "main";
        default:
          return screen;
      }

    case "casual_line":
      return action.type === "back" ? "main" : screen;

    case "recommendation_result":
      switch (action.type) {
        case "open_recommendation":
          return null;
        case "dismiss_recommendation":
          return screen;
        case "back":
          return "main";
        default:
          return screen;
      }
  }
}

function countIsPositive(value: number): boolean {
  return value > 0;
}

/**
 * Produces at most three short, deterministic status lines.  Counts are
 * supplied by the local garden query; this function never reads or mutates
 * persistence state.
 */
export function getGardenSummaryLines(summary: CompanionNpcGardenSummary): readonly string[] {
  const hasAnyContent =
    countIsPositive(summary.activeCount) ||
    countIsPositive(summary.dormantCount) ||
    countIsPositive(summary.completedCount) ||
    countIsPositive(summary.archivedCount);

  if (!hasAnyContent) {
    return ["花园现在还是空的。种下第一个想法后，这里就会慢慢有变化。"];
  }

  const lines: string[] = [];
  if (summary.activeCount > 0 && summary.dormantCount > 0) {
    lines.push(
      `现在有 ${summary.activeCount} 株植物正在生长，还有 ${summary.dormantCount} 株正在休息。`,
    );
  } else if (summary.activeCount > 0) {
    lines.push(`现在有 ${summary.activeCount} 株植物正在生长，暂时没有休眠的植物。`);
  } else if (summary.dormantCount > 0) {
    lines.push(`现在有 ${summary.dormantCount} 株植物正在休息，暂时没有活跃的植物。`);
  }

  if (summary.completedCount > 0) {
    lines.push(`你已经让 ${summary.completedCount} 株植物永久盛开了。`);
  }

  if (summary.archivedCount > 0) {
    lines.push(`还有 ${summary.archivedCount} 株内容已经封存，仍然保留在卡片里。`);
  }

  return lines;
}

/** Chooses one stable ambient line using the documented priority order. */
export function getCasualLine(summary: CompanionNpcGardenSummary): string {
  const hasAnyContent =
    countIsPositive(summary.activeCount) ||
    countIsPositive(summary.dormantCount) ||
    countIsPositive(summary.completedCount) ||
    countIsPositive(summary.archivedCount);

  if (!hasAnyContent) {
    return "我会在这里等你。等你有想法的时候，再种下第一颗种子吧。";
  }

  if (summary.dormantCount > 0) {
    return "有些植物正在休息。它们没有消失，只是在等你再次想起。";
  }

  if (summary.completedCount > 0) {
    return "已经盛开的植物会一直留在这里。";
  }

  if (summary.activeCount > 0) {
    return "花园今天也有一些植物在慢慢生长。";
  }

  return "我会在这里，等你想起花园的时候再来。";
}

/** Fixed explanation of growth behavior; it intentionally avoids internals. */
export function getGrowthRuleLines(): readonly string[] {
  return [
    "补充文字、添加链接、添加图片、添加语音、写下一步、记录现实进展，以及发展成新想法，都会按照花园的规则留下成长记录。同类行为在同一天只计一次。",
    "图片分析和语音转写本身不会增加成长分，也不会自动改变植物阶段。标记完成后，植物会永久盛开；休眠不是死亡。",
  ];
}

/** Fixed explanation of lifecycle behavior; it is not generated from AI. */
export function getLifecycleRuleLines(): readonly string[] {
  return [
    "连续满 72 小时没有有效互动后，植物可能进入休眠。内容不会消失，重新打开或复盘可以恢复，植物不会死亡。",
    "标记完成后植物会永久盛开，仍然可以查看、编辑和补充。封存会把内容从当前花园中收起并释放植物槽位，但内容仍然保留，也可以恢复；封存和完成可以同时存在。",
  ];
}
