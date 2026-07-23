import { buildGardenPlantSnapshot, type GardenPlantSnapshot } from "../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";

export function queryGardenPlantSnapshot(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<GardenPlantSnapshot> {
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);

  return database.transaction("r", database.fragments, database.plants, async () => {
    const [fragments, plants] = await Promise.all([
      fragmentRepository.list(),
      plantRepository.list(),
    ]);

    return buildGardenPlantSnapshot(fragments, plants);
  });
}
