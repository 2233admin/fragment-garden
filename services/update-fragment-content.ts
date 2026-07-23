import { deriveLocalFragmentTitle, type Fragment, type Plant } from "../domain";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type UpdateFragmentContentInput = {
  fragmentId: string;
  title?: string;
  rawText: string;
};

export type UpdateFragmentContentResult = {
  fragment: Fragment;
  plant: Plant;
};

export async function updateFragmentContent(
  input: UpdateFragmentContentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<UpdateFragmentContentResult> {
  if (input.rawText.trim().length === 0) {
    throw new Error("Fragment text cannot be empty");
  }

  const manualTitle = input.title?.trim();
  const title =
    manualTitle === undefined || manualTitle.length === 0
      ? deriveLocalFragmentTitle(input.rawText)
      : manualTitle;
  const { database, timestamp } = resolveLocalServiceDependencies(dependencies);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);

  return database.transaction("rw", database.fragments, database.plants, async () => {
    const [fragment, plant] = await Promise.all([
      fragmentRepository.getById(input.fragmentId),
      plantRepository.getByFragmentId(input.fragmentId),
    ]);

    if (fragment === undefined) {
      throw new Error(`Fragment ${input.fragmentId} was not found`);
    }

    if (plant === undefined) {
      throw new Error(`Plant for fragment ${input.fragmentId} was not found`);
    }

    requireFragmentCanInteract(fragment);

    const updatedFragment: Fragment = {
      ...fragment,
      title,
      rawText: input.rawText,
      lifecycleStatus: "active",
      updatedAt: timestamp,
      lastInteractedAt: timestamp,
    };
    const updatedPlant: Plant =
      plant.vitality === "dormant" ? { ...plant, vitality: "active", updatedAt: timestamp } : plant;

    requireRecordUpdated(
      await fragmentRepository.update(fragment.id, {
        title,
        rawText: input.rawText,
        lifecycleStatus: "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      }),
      "Fragment",
    );

    if (updatedPlant !== plant) {
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          vitality: "active",
          updatedAt: timestamp,
        }),
        "Plant",
      );
    }

    return { fragment: updatedFragment, plant: updatedPlant };
  });
}
