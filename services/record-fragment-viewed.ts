import type { Fragment, FragmentEvent, Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type RecordFragmentViewedInput = {
  fragmentId: string;
};

export type RecordFragmentViewedResult = {
  fragment: Fragment;
  plant: Plant;
  viewedEvent: FragmentEvent;
};

export async function recordFragmentViewed(
  input: RecordFragmentViewedInput,
  dependencies: LocalServiceDependencies = {},
): Promise<RecordFragmentViewedResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    async () => {
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
        lifecycleStatus:
          fragment.lifecycleStatus === "dormant" ? "active" : fragment.lifecycleStatus,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant =
        plant.vitality === "dormant"
          ? { ...plant, vitality: "active", updatedAt: timestamp }
          : plant;
      const viewedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "viewed",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          lifecycleStatus: updatedFragment.lifecycleStatus,
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

      await fragmentEventRepository.add(viewedEvent);

      return { fragment: updatedFragment, plant: updatedPlant, viewedEvent };
    },
  );
}
