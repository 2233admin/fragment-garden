import type { FragmentEvent } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export class FragmentEventRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  add(event: FragmentEvent): Promise<string> {
    return this.database.fragmentEvents.add(event);
  }

  async listByFragmentId(fragmentId: string): Promise<FragmentEvent[]> {
    const events = await this.database.fragmentEvents
      .where("fragmentId")
      .equals(fragmentId)
      .toArray();

    return events.sort((left, right) => {
      const occurredAtComparison = left.occurredAt.localeCompare(right.occurredAt);
      return occurredAtComparison === 0 ? left.id.localeCompare(right.id) : occurredAtComparison;
    });
  }
}
