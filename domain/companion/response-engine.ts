import {
  companionApiErrorSchema,
  companionApiResultSchema,
  type CompanionApiResult,
} from "../../validation/companion-api";
import { LocalCompanionResponseEngine } from "./local-response-engine";
import type { AllowedOpenFragment, CompanionContext, GardenSummary } from "./context-builder";

export type CompanionEngineInput = Readonly<{
  message: string;
  messages: readonly { role: "user" | "assistant"; content: string }[];
  currentGardenSummary: GardenSummary;
  allowedOpenFragments: readonly AllowedOpenFragment[];
}>;

export type CompanionEngineResult = CompanionApiResult;

export interface CompanionResponseEngine {
  respond(input: CompanionEngineInput): Promise<CompanionEngineResult>;
}

export class CompanionProviderError extends Error {
  readonly code: string;
  readonly canFallback: boolean;

  constructor(code: string, message: string, canFallback = true) {
    super(message);
    this.name = "CompanionProviderError";
    this.code = code;
    this.canFallback = canFallback;
  }
}

export class LocalCompanionResponseEngineAdapter implements CompanionResponseEngine {
  private readonly engine = new LocalCompanionResponseEngine();

  async respond(input: CompanionEngineInput): Promise<CompanionEngineResult> {
    const response = this.engine.respond({ message: input.message });
    if (response.action?.type === "RECOMMEND_FRAGMENT") {
      return {
        type: "tool_call",
        callId: "local-recommend",
        name: "recommend_fragment",
        arguments: {},
      };
    }
    if (response.action?.type === "IMPORT_LINK") {
      return {
        type: "tool_call",
        callId: "local-import-link",
        name: "import_link",
        arguments: { url: response.action.url, title: null },
      };
    }
    return { type: "message", message: response.message };
  }
}

export class OpenAICompanionResponseEngine implements CompanionResponseEngine {
  constructor(
    private readonly fetchImplementation: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  async respond(input: CompanionEngineInput): Promise<CompanionEngineResult> {
    const response = await this.fetchImplementation("/api/companion/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: input.messages,
        gardenSummary: input.currentGardenSummary,
        allowedOpenFragments: input.allowedOpenFragments,
      }),
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CompanionProviderError("invalid_model_response", "AI 服务返回了无法读取的结果。");
    }

    if (!response.ok) {
      const errorResult = companionApiErrorSchema.safeParse(body);
      const errorCode = errorResult.success ? errorResult.data.error.code : "provider_error";
      throw new CompanionProviderError(errorCode, companionErrorMessage(errorCode));
    }

    const result = companionApiResultSchema.safeParse(body);
    if (!result.success) {
      throw new CompanionProviderError("invalid_model_response", "AI 服务返回了无法识别的结果。");
    }
    return result.data;
  }
}

export function companionErrorMessage(code: string): string {
  switch (code) {
    case "openai_disabled":
    case "missing_configuration":
      return "AI 模式尚未启用，可以继续使用基础模式。";
    case "authentication_failed":
      return "AI 服务认证失败，请稍后重试或使用基础模式。";
    case "rate_limited":
      return "AI 请求暂时较多，请稍后重试。";
    case "model_unavailable":
      return "当前配置的 AI 模型暂时不可用，请检查模型权限或使用基础模式。";
    case "request_timeout":
      return "AI 服务响应时间过长，可以重试或使用基础模式。";
    default:
      return "我暂时没能连接到 AI 服务。你可以重试，或者继续使用基础模式。";
  }
}

export type { AllowedOpenFragment, CompanionContext, GardenSummary };
