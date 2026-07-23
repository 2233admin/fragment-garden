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

  add(fragment: Fragment): Promise<string> {
    return this.database.fragments.add(fragment);
  }

  update(id: string, changes: FragmentUpdate): Promise<number> {
    return this.database.fragments.update(id, changes);
  }
}
