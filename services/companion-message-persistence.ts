import type { ChatMessage } from "../domain";
import { ChatMessageRepository } from "../data/repositories/chat-message-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CreatePendingCompanionMessageInput = Readonly<{
  content: string;
  clientRequestId: string;
  now: string;
}>;

function nextTimestamp(messages: readonly ChatMessage[], requested: string): string {
  const requestedValue = Date.parse(requested);
  const latestValue = Date.parse(messages.at(-1)?.createdAt ?? "");
  return new Date(
    Math.max(
      Number.isFinite(requestedValue) ? requestedValue : 0,
      Number.isFinite(latestValue) ? latestValue + 1 : 0,
    ),
  ).toISOString();
}

export async function createPendingCompanionUserMessage(
  input: CreatePendingCompanionMessageInput,
  dependencies: LocalServiceDependencies = {},
): Promise<ChatMessage> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error("Companion message cannot be empty");
  }
  if (input.clientRequestId.trim().length === 0) {
    throw new Error("Companion request id cannot be empty");
  }

  const { database, createId } = resolveLocalServiceDependencies(dependencies);
  const repository = new ChatMessageRepository(database);
  return database.transaction("rw", database.chatMessages, async () => {
    const existing = await repository.findByClientRequestId(input.clientRequestId);
    if (existing !== undefined) {
      if (existing.status === "failed") {
        await repository.updateById(existing.id, { status: "pending", errorCode: null });
        return { ...existing, status: "pending", errorCode: null };
      }
      return existing;
    }
    const messages = await repository.list();
    const message: ChatMessage = {
      id: createId(),
      fragmentId: null,
      role: "user",
      content,
      createdAt: nextTimestamp(messages, input.now),
      source: "local",
      status: "pending",
      clientRequestId: input.clientRequestId,
      errorCode: null,
    };
    await repository.add(message);
    return message;
  });
}

export async function completeCompanionUserMessage(
  clientRequestId: string,
  dependencies: LocalServiceDependencies = {},
): Promise<ChatMessage | null> {
  const { database } = resolveLocalServiceDependencies(dependencies);
  const repository = new ChatMessageRepository(database);
  return database.transaction("rw", database.chatMessages, async () => {
    const existing = await repository.findByClientRequestId(clientRequestId);
    if (existing === undefined) {
      return null;
    }
    await repository.updateById(existing.id, { status: "completed", errorCode: null });
    return { ...existing, status: "completed", errorCode: null };
  });
}

export async function failCompanionUserMessage(
  clientRequestId: string,
  errorCode: string,
  dependencies: LocalServiceDependencies = {},
): Promise<ChatMessage | null> {
  const { database } = resolveLocalServiceDependencies(dependencies);
  const repository = new ChatMessageRepository(database);
  return database.transaction("rw", database.chatMessages, async () => {
    const existing = await repository.findByClientRequestId(clientRequestId);
    if (existing === undefined) {
      return null;
    }
    await repository.updateById(existing.id, { status: "failed", errorCode });
    return { ...existing, status: "failed", errorCode };
  });
}

export async function appendCompanionAssistantMessageOnce(
  input: Readonly<{
    content: string;
    clientRequestId: string;
    source: "local" | "openai" | "tool";
    fragmentId?: string | null;
    now: string;
  }>,
  dependencies: LocalServiceDependencies = {},
): Promise<ChatMessage> {
  const content = input.content.trim();
  if (content.length === 0) {
    throw new Error("Assistant companion message cannot be empty");
  }
  const { database, createId } = resolveLocalServiceDependencies(dependencies);
  const repository = new ChatMessageRepository(database);
  return database.transaction("rw", database.chatMessages, async () => {
    const existing = await repository.findByClientRequestId(input.clientRequestId);
    if (existing !== undefined) {
      return existing;
    }
    const messages = await repository.list();
    const message: ChatMessage = {
      id: createId(),
      fragmentId: input.fragmentId ?? null,
      role: "assistant",
      content,
      createdAt: nextTimestamp(messages, input.now),
      source: input.source,
      status: "completed",
      clientRequestId: input.clientRequestId,
      errorCode: null,
    };
    await repository.add(message);
    return message;
  });
}
