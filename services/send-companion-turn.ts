import type { ChatMessage } from "../domain";
import {
  buildCompanionContext,
  type AllowedOpenFragment,
  type GardenSummary,
} from "../domain/companion/context-builder";
import {
  CompanionProviderError,
  LocalCompanionResponseEngineAdapter,
  OpenAICompanionResponseEngine,
  type CompanionEngineResult,
} from "../domain/companion/response-engine";
import { listChatMessages } from "../data/queries/companion-query";
import {
  appendCompanionAssistantMessageOnce,
  completeCompanionUserMessage,
  createPendingCompanionUserMessage,
  failCompanionUserMessage,
} from "./companion-message-persistence";
import type { LocalServiceDependencies } from "./local-service-dependencies";

export const COMPANION_AI_FALLBACK_MESSAGE = "AI 服务暂时不可用，下面是基础模式的回复。";

export type SendCompanionTurnInput = Readonly<{
  content: string;
  mode: "local" | "openai";
  gardenSummary: GardenSummary;
  allowedOpenFragments: readonly AllowedOpenFragment[];
  now: string;
  clientRequestId: string;
  fallbackToLocal?: boolean;
}>;

export type SendCompanionTurnResult = Readonly<{
  userMessage: ChatMessage;
  response: CompanionEngineResult;
  usedFallback: boolean;
  fallbackErrorCode: string | null;
}>;

function makeEngine(
  mode: SendCompanionTurnInput["mode"],
): LocalCompanionResponseEngineAdapter | OpenAICompanionResponseEngine {
  return mode === "openai"
    ? new OpenAICompanionResponseEngine()
    : new LocalCompanionResponseEngineAdapter();
}

export async function sendCompanionTurn(
  input: SendCompanionTurnInput,
  dependencies: LocalServiceDependencies = {},
): Promise<SendCompanionTurnResult> {
  const userMessage = await createPendingCompanionUserMessage(
    {
      content: input.content,
      clientRequestId: input.clientRequestId,
      now: input.now,
    },
    dependencies,
  );

  const isRetryableOrNew = userMessage.status === "pending";
  if (!isRetryableOrNew && userMessage.status === "completed") {
    return {
      userMessage,
      response: { type: "message", message: "" },
      usedFallback: false,
      fallbackErrorCode: null,
    };
  }

  const messages = await listChatMessages(dependencies.database);
  const context = buildCompanionContext({
    messages: messages.map((message) =>
      message.id === userMessage.id ? { ...message, status: "completed" } : message,
    ),
    currentGardenSummary: input.gardenSummary,
    allowedOpenFragments: input.allowedOpenFragments,
  });
  const engine = makeEngine(input.mode);

  try {
    let usedFallback = false;
    let fallbackErrorCode: string | null = null;
    let response: CompanionEngineResult;
    try {
      response = await engine.respond({
        message: input.content,
        messages: context.messages,
        currentGardenSummary: context.currentGardenSummary,
        allowedOpenFragments: context.allowedOpenFragments,
      });
    } catch (error) {
      const providerErrorCode = error instanceof CompanionProviderError ? error.code : null;
      const isConfigurationFallback =
        providerErrorCode === "openai_disabled" || providerErrorCode === "missing_configuration";
      if (input.mode !== "openai" || (input.fallbackToLocal !== true && !isConfigurationFallback)) {
        throw error;
      }
      response = await new LocalCompanionResponseEngineAdapter().respond({
        message: input.content,
        messages: context.messages,
        currentGardenSummary: context.currentGardenSummary,
        allowedOpenFragments: context.allowedOpenFragments,
      });
      usedFallback = true;
      fallbackErrorCode = error instanceof CompanionProviderError ? error.code : "provider_error";
    }
    const completedUserMessage = await completeCompanionUserMessage(
      input.clientRequestId,
      dependencies,
    );
    if (completedUserMessage === null) {
      throw new Error("Companion user message disappeared");
    }
    if (response.type === "message") {
      await appendCompanionAssistantMessageOnce(
        {
          content: usedFallback
            ? `${COMPANION_AI_FALLBACK_MESSAGE}\n${response.message}`
            : response.message,
          clientRequestId: `${input.clientRequestId}:assistant`,
          source: usedFallback || input.mode === "local" ? "local" : "openai",
          now: input.now,
        },
        dependencies,
      );
    }
    return { userMessage: completedUserMessage, response, usedFallback, fallbackErrorCode };
  } catch (error) {
    await failCompanionUserMessage(
      input.clientRequestId,
      error instanceof CompanionProviderError ? error.code : "provider_error",
      dependencies,
    );
    throw error;
  }
}

export async function appendToolResultMessage(
  input: Readonly<{
    requestId: string;
    content: string;
    fragmentId?: string | null;
    now: string;
    messageKey?: "tool" | "fallback";
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ChatMessage> {
  return appendCompanionAssistantMessageOnce(
    {
      content: input.content,
      clientRequestId: `${input.requestId}:${input.messageKey ?? "tool"}`,
      source: "tool",
      fragmentId: input.fragmentId,
      now: input.now,
    },
    dependencies,
  );
}
