import type { ChatMessage } from "../domain/shared/types";
import {
  LocalCompanionResponseEngine,
  type CompanionResponse,
  type CompanionResponseEngine,
} from "../domain/companion/local-response-engine";
import { ChatMessageRepository } from "../data/repositories/chat-message-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";
import {
  requestFragmentRecommendation,
  type FragmentRecommendationResult,
} from "./request-fragment-recommendation";

export const COMPANION_RECOMMENDATION_UNAVAILABLE_MESSAGE =
  "暂时没能找到适合回看的内容，你仍然可以在卡片模式中查找。";

export type SendCompanionMessageInput = Readonly<{
  content: string;
  now: string;
}>;

export type SendCompanionMessageDependencies = LocalServiceDependencies &
  Readonly<{
    responseEngine?: CompanionResponseEngine;
  }>;

export type SendCompanionMessageResult = Readonly<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  response: CompanionResponse;
  recommendation: FragmentRecommendationResult | null;
}>;

export async function sendCompanionMessage(
  input: SendCompanionMessageInput,
  dependencies: SendCompanionMessageDependencies = {},
): Promise<SendCompanionMessageResult> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error("Companion message cannot be empty");
  }

  const responseEngine = dependencies.responseEngine ?? new LocalCompanionResponseEngine();
  const response = responseEngine.respond({ message: content });
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const chatMessageRepository = new ChatMessageRepository(database);

  return database.transaction(
    "rw",
    database.chatMessages,
    database.fragments,
    database.recommendations,
    async () => {
      const recommendation =
        response.action?.type === "RECOMMEND_FRAGMENT"
          ? await requestFragmentRecommendation(
              { now: timestamp },
              { database, createId, now: () => new Date(timestamp) },
            )
          : null;
      const assistantContent =
        response.action?.type === "RECOMMEND_FRAGMENT" && recommendation === null
          ? COMPANION_RECOMMENDATION_UNAVAILABLE_MESSAGE
          : response.message;
      const existingMessages = await chatMessageRepository.list();
      const latestMessageTimestamp =
        existingMessages.length === 0
          ? Number.NEGATIVE_INFINITY
          : new Date(existingMessages.at(-1)?.createdAt ?? timestamp).getTime();
      const userTimestampValue = Math.max(
        new Date(timestamp).getTime(),
        latestMessageTimestamp + 1,
      );
      const userTimestamp = new Date(userTimestampValue).toISOString();
      const assistantTimestamp = new Date(userTimestampValue + 1).toISOString();
      const userMessage: ChatMessage = {
        id: createId(),
        fragmentId: null,
        role: "user",
        content,
        createdAt: userTimestamp,
      };
      const assistantMessage: ChatMessage = {
        id: createId(),
        fragmentId: null,
        role: "assistant",
        content: assistantContent,
        createdAt: assistantTimestamp,
      };

      await chatMessageRepository.add(userMessage);
      await chatMessageRepository.add(assistantMessage);

      return {
        userMessage,
        assistantMessage,
        response: {
          ...response,
          message: assistantContent,
        },
        recommendation,
      };
    },
  );
}
