import { shouldFragmentBeDormant, type Fragment, type FragmentEvent, type Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type DormancyTransition = Readonly<{
  fragment: Fragment;
  plant: Plant;
  dormantEvent: FragmentEvent;
}>;

export type ApplyDormancyTransitionsResult = Readonly<{
  transitions: DormancyTransition[];
}>;

export type ApplyDormancyTransitionsInput = Readonly<{
  now: string;
}>;

export async function applyDormancyTransitions(
  input: ApplyDormancyTransitionsInput,
  dependencies: LocalServiceDependencies = {},
): Promise<ApplyDormancyTransitionsResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    async () => {
      const [fragments, plants] = await Promise.all([
        fragmentRepository.list(),
        plantRepository.list(),
      ]);
      const plantByFragmentId = new Map(plants.map((plant) => [plant.fragmentId, plant] as const));
      const transitions: DormancyTransition[] = [];

      for (const fragment of fragments) {
        if (
          fragment.lifecycleStatus !== "active" ||
          !shouldFragmentBeDormant({
            lastInteractedAt: fragment.lastInteractedAt,
            completionStatus: fragment.completionStatus,
            now: timestamp,
          })
        ) {
          continue;
        }

        const plant = plantByFragmentId.get(fragment.id);

        if (plant === undefined) {
          throw new Error(`Plant for fragment ${fragment.id} was not found`);
        }

        const updatedFragment: Fragment = {
          ...fragment,
          lifecycleStatus: "dormant",
          updatedAt: timestamp,
        };
        const updatedPlant: Plant = {
          ...plant,
          vitality: "dormant",
          updatedAt: timestamp,
        };
        const dormantEvent: FragmentEvent = {
          id: createId(),
          fragmentId: fragment.id,
          type: "dormant",
          payload: null,
          occurredAt: timestamp,
          ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
        };

        requireRecordUpdated(
          await fragmentRepository.update(fragment.id, {
            lifecycleStatus: "dormant",
            updatedAt: timestamp,
          }),
          "Fragment",
        );
        requireRecordUpdated(
          await plantRepository.update(plant.id, {
            vitality: "dormant",
            updatedAt: timestamp,
          }),
          "Plant",
        );
        await fragmentEventRepository.add(dormantEvent);
        transitions.push({
          fragment: updatedFragment,
          plant: updatedPlant,
          dormantEvent,
        });
      }

      return { transitions };
    },
  );
}
