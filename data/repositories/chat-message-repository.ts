import type { ChatMessage } from "../../domain/shared/types";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export class ChatMessageRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  add(message: ChatMessage): Promise<string> {
    return this.database.chatMessages.add(message);
  }

  async findByClientRequestId(clientRequestId: string): Promise<ChatMessage | undefined> {
    const messages = await this.database.chatMessages.toArray();
    return messages.find((message) => message.clientRequestId === clientRequestId);
  }

  async updateById(id: string, changes: Partial<ChatMessage>): Promise<number> {
    return this.database.chatMessages.update(id, changes);
  }

  async list(): Promise<ChatMessage[]> {
    const messages = await this.database.chatMessages.toArray();

    return messages.sort((left, right) => {
      const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
      return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
    });
  }
}
