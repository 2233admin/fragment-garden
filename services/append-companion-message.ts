import type { ChatMessage } from "../domain";
import { ChatMessageRepository } from "../data/repositories/chat-message-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AppendAssistantCompanionMessageInput = Readonly<{
  content: string;
  fragmentId?: string | null;
  now: string;
}>;

export async function appendAssistantCompanionMessage(
  input: AppendAssistantCompanionMessageInput,
  dependencies: LocalServiceDependencies = {},
): Promise<ChatMessage> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error("Assistant companion message cannot be empty");
  }

  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new ChatMessageRepository(database);

  return database.transaction("rw", database.chatMessages, async () => {
    const existingMessages = await repository.list();
    const latestTimestamp = Date.parse(existingMessages.at(-1)?.createdAt ?? "");
    const requestedTimestamp = Date.parse(timestamp);
    const createdAt = new Date(
      Math.max(
        Number.isFinite(requestedTimestamp) ? requestedTimestamp : 0,
        Number.isFinite(latestTimestamp) ? latestTimestamp + 1 : 0,
      ),
    ).toISOString();
    const message: ChatMessage = {
      id: createId(),
      role: "assistant",
      content,
      fragmentId: input.fragmentId ?? null,
      createdAt,
    };

    await repository.add(message);
    return message;
  });
}
