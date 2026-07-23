import type { Fragment, FragmentEvent, Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import { parseRestoredEventPayload } from "../validation/fragment-event-payload";
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
  restoredEvent: FragmentEvent | null;
};

export async function recordFragmentViewed(
  input: RecordFragmentViewedInput,
  dependencies: LocalServiceDependencies = {},
): Promise<RecordFragmentViewedResult> {
  const restoredPayload = parseRestoredEventPayload({ reason: "viewed" });
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

      const wasDormant = fragment.lifecycleStatus === "dormant";
      const isArchived = fragment.lifecycleStatus === "archived";
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: isArchived ? "archived" : "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const stage = fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage;
      const slotId = isArchived ? null : plant.slotId;
      const shouldUpdatePlant =
        plant.vitality !== "active" || plant.stage !== stage || plant.slotId !== slotId;
      const updatedPlant: Plant = shouldUpdatePlant
        ? {
            ...plant,
            stage,
            vitality: "active",
            slotId,
            updatedAt: timestamp,
          }
        : plant;
      const viewedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "viewed",
        payload: null,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const restoredEvent: FragmentEvent | null = wasDormant
        ? {
            id: createId(),
            fragmentId: fragment.id,
            type: "restored",
            payload: restoredPayload,
            occurredAt: timestamp,
            ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
          }
        : null;

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
            stage,
            vitality: "active",
            slotId,
            updatedAt: timestamp,
          }),
          "Plant",
        );
      }

      await fragmentEventRepository.add(viewedEvent);
      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        viewedEvent,
        restoredEvent,
      };
    },
  );
}
