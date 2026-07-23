import type { Plant } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

export type PlantUpdate = Partial<Omit<Plant, "id">>;

export class PlantRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  getById(id: string): Promise<Plant | undefined> {
    return this.database.plants.get(id);
  }

  getByFragmentId(fragmentId: string): Promise<Plant | undefined> {
    return this.database.plants.where("fragmentId").equals(fragmentId).first();
  }

  list(): Promise<Plant[]> {
    return this.database.plants.toArray();
  }

  listByFragmentIds(fragmentIds: readonly string[]): Promise<Plant[]> {
    const uniqueFragmentIds = [...new Set(fragmentIds)];

    if (uniqueFragmentIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.database.plants.where("fragmentId").anyOf(uniqueFragmentIds).toArray();
  }

  add(plant: Plant): Promise<string> {
    return this.database.plants.add(plant);
  }

  update(id: string, changes: PlantUpdate): Promise<number> {
    return this.database.plants.update(id, changes);
  }
}
