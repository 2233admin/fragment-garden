import type { Fragment, Plant } from "../../domain";
import { safelyParseTextAddedEventPayload } from "../../validation/fragment-event-payload";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { FragmentEventRepository } from "../repositories/fragment-event-repository";
import { FragmentRepository } from "../repositories/fragment-repository";
import { PlantRepository } from "../repositories/plant-repository";

export type TextSupplementViewModel = {
  id: string;
  text: string;
  occurredAt: string;
};

export type FragmentDetailViewModel = {
  fragment: Fragment;
  plant: Plant;
  textSupplements: TextSupplementViewModel[];
};

export function getFragmentDetailViewModel(
  fragmentId: string,
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<FragmentDetailViewModel | undefined> {
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);

  return database.transaction(
    "r",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    async () => {
      const [fragment, plant, events] = await Promise.all([
        fragmentRepository.getById(fragmentId),
        plantRepository.getByFragmentId(fragmentId),
        fragmentEventRepository.listByFragmentId(fragmentId),
      ]);

      if (fragment === undefined) {
        return undefined;
      }

      if (plant === undefined) {
        throw new Error(`Plant not found for fragment ${fragmentId}`);
      }

      const textSupplements: TextSupplementViewModel[] = [];

      for (const event of events) {
        if (event.type !== "text_added") {
          continue;
        }

        const payload = safelyParseTextAddedEventPayload(event.payload);

        if (payload !== null) {
          textSupplements.push({
            id: event.id,
            text: payload.text,
            occurredAt: event.occurredAt,
          });
        }
      }

      return { fragment, plant, textSupplements };
    },
  );
}
