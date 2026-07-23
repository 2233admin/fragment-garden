import type { FragmentEvent } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export class FragmentEventRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  add(event: FragmentEvent): Promise<string> {
    return this.database.fragmentEvents.add(event);
  }

  listByFragmentId(fragmentId: string): Promise<FragmentEvent[]> {
    return this.database.fragmentEvents.where("fragmentId").equals(fragmentId).sortBy("occurredAt");
  }
}
