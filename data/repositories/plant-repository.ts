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

  add(plant: Plant): Promise<string> {
    return this.database.plants.add(plant);
  }

  update(id: string, changes: PlantUpdate): Promise<number> {
    return this.database.plants.update(id, changes);
  }
}
