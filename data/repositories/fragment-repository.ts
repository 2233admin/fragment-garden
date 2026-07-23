import type { Fragment } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type FragmentUpdate = Partial<Omit<Fragment, "id">>;

export class FragmentRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  getById(id: string): Promise<Fragment | undefined> {
    return this.database.fragments.get(id);
  }

  list(): Promise<Fragment[]> {
    return this.database.fragments.toArray();
  }

  async listByIds(ids: readonly string[]): Promise<Fragment[]> {
    const uniqueIds = [...new Set(ids)];

    if (uniqueIds.length === 0) {
      return [];
    }

    const fragments = await this.database.fragments.bulkGet(uniqueIds);
    return fragments.filter((fragment): fragment is Fragment => fragment !== undefined);
  }

  listVisibleFragments(): Promise<Fragment[]> {
    return this.database.fragments
      .filter((fragment) => fragment.lifecycleStatus !== "deleted")
      .toArray();
  }

  add(fragment: Fragment): Promise<string> {
    return this.database.fragments.add(fragment);
  }

  update(id: string, changes: FragmentUpdate): Promise<number> {
    return this.database.fragments.update(id, changes);
  }
}
