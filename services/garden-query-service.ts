import { buildGardenPlantSnapshot, type GardenPlantSnapshot, type GardenSummary } from "../domain";
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

export async function queryGardenSummary(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<GardenSummary> {
  const fragmentRepository = new FragmentRepository(database);
  return database.transaction("r", database.fragments, async () => {
    const fragments = await fragmentRepository.list();
    return {
      activeCount: fragments.filter((fragment) => fragment.lifecycleStatus === "active").length,
      dormantCount: fragments.filter((fragment) => fragment.lifecycleStatus === "dormant").length,
      completedCount: fragments.filter((fragment) => fragment.completionStatus === "completed")
        .length,
      archivedCount: fragments.filter((fragment) => fragment.lifecycleStatus === "archived").length,
    };
  });
}
