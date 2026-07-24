import { parseExternalUrl } from "../links/external-url";

export type CompanionAction =
  | Readonly<{ type: "RECOMMEND_FRAGMENT" }>
  | Readonly<{ type: "IMPORT_LINK"; url: string; title?: string | null; requestId?: string }>;

export type CompanionResponse = Readonly<{
  message: string;
  action: CompanionAction | null;
}>;

export type CompanionResponseInput = Readonly<{
  message: string;
}>;

export interface CompanionResponseEngine {
  respond(input: CompanionResponseInput): CompanionResponse;
}

export const COMPANION_HELP_RESPONSE =
  "你可以种下文字或链接碎片，在卡片和花园之间切换，并通过回看和补充让植物继续成长。连续满 72 小时没有互动后，植物会休眠，但内容不会消失。";

export const COMPANION_GROWTH_RESPONSE =
  "补充文字、添加链接、图片或语音、记录现实进展，以及发展成新想法，都会按照花园的成长规则留下记录；标记完成后植物会永久盛开。当前版本支持文字补充和链接碎片，图片与语音将在后续版本加入。";

export const COMPANION_DORMANCY_RESPONSE =
  "植物连续满 72 小时没有互动后会休眠，内容不会消失。再次打开或复盘后它会恢复，植物也不会死亡。";

export const COMPANION_RECOMMENDATION_RESPONSE = "我来帮你找一株适合重新看看的植物。";

export const COMPANION_LINK_IMPORT_RESPONSE =
  "我可以帮你把这个链接先种在本地，再尝试读取其中的内容。";

export const COMPANION_FALLBACK_RESPONSE =
  "我目前主要帮助你照看花园、解释植物状态，并带你重新看看以前种下的内容。";

const RECOMMENDATION_PATTERNS = ["推荐", "看看什么", "回顾", "以前的想法", "以前种下"];
const DORMANCY_PATTERNS = ["休眠", "休息", "会死", "死亡", "消失"];
const GROWTH_PATTERNS = ["成长", "长大", "开花", "成长分", "永久盛开"];
const HELP_PATTERNS = ["怎么使用", "如何使用", "能做什么", "怎么种", "如何种", "帮助"];
const LINK_IMPORT_PATTERNS = [
  "帮我种下这个链接",
  "保存这个网页",
  "保存这个链接",
  "记一个",
  "记一下",
];
const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_URL_PUNCTUATION = /[.,!?;:，。！？；：、）】》」』]+$/u;

function includesAny(message: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

function extractImportLink(message: string): string | null {
  const match = URL_PATTERN.exec(message);
  URL_PATTERN.lastIndex = 0;
  if (match === null) {
    return null;
  }

  const candidate = match[0].replace(TRAILING_URL_PUNCTUATION, "");
  const isStandaloneUrl = message.trim() === match[0];
  if (!isStandaloneUrl && !includesAny(message, LINK_IMPORT_PATTERNS)) {
    return null;
  }

  try {
    parseExternalUrl(candidate);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * This engine deliberately has no companion type or persistence dependency.
 * Cat and dog therefore share exactly the same deterministic behavior.
 */
export class LocalCompanionResponseEngine implements CompanionResponseEngine {
  respond(input: CompanionResponseInput): CompanionResponse {
    const originalMessage = input.message.trim();
    const message = originalMessage.toLowerCase();
    const importLinkUrl = extractImportLink(originalMessage);

    if (importLinkUrl !== null) {
      return {
        message: COMPANION_LINK_IMPORT_RESPONSE,
        action: { type: "IMPORT_LINK", url: importLinkUrl },
      };
    }

    if (includesAny(message, RECOMMENDATION_PATTERNS)) {
      return {
        message: COMPANION_RECOMMENDATION_RESPONSE,
        action: { type: "RECOMMEND_FRAGMENT" },
      };
    }

    if (includesAny(message, DORMANCY_PATTERNS)) {
      return {
        message: COMPANION_DORMANCY_RESPONSE,
        action: null,
      };
    }

    if (includesAny(message, GROWTH_PATTERNS)) {
      return {
        message: COMPANION_GROWTH_RESPONSE,
        action: null,
      };
    }

    if (includesAny(message, HELP_PATTERNS)) {
      return {
        message: COMPANION_HELP_RESPONSE,
        action: null,
      };
    }

    return {
      message: COMPANION_FALLBACK_RESPONSE,
      action: null,
    };
  }
}
