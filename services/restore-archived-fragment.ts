import {
  PLANT_SLOT_IDS,
  allocateFirstAvailablePlantSlot,
  type Fragment,
  type FragmentEvent,
  type Plant,
} from "../domain";
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

export type RestoreArchivedFragmentInput = Readonly<{
  fragmentId: string;
  now: string;
}>;

export type RestoreArchivedFragmentResult = Readonly<{
  fragment: Fragment;
  plant: Plant;
  restoredEvent: FragmentEvent | null;
}>;

export async function restoreArchivedFragment(
  input: RestoreArchivedFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<RestoreArchivedFragmentResult> {
  const restoredPayload = parseRestoredEventPayload({ reason: "manual_restore" });
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
      const [fragment, plant, plants] = await Promise.all([
        fragmentRepository.getById(input.fragmentId),
        plantRepository.getByFragmentId(input.fragmentId),
        plantRepository.list(),
      ]);

      if (fragment === undefined) {
        throw new Error(`Fragment ${input.fragmentId} was not found`);
      }

      if (plant === undefined) {
        throw new Error(`Plant for fragment ${input.fragmentId} was not found`);
      }

      requireFragmentCanInteract(fragment);

      if (fragment.lifecycleStatus !== "archived") {
        return {
          fragment,
          plant,
          restoredEvent: null,
        };
      }

      const occupiedSlotIds = plants
        .filter((candidate) => candidate.id !== plant.id)
        .map((candidate) => candidate.slotId);
      const slotId = allocateFirstAvailablePlantSlot(PLANT_SLOT_IDS, occupiedSlotIds);
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        stage: fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage,
        vitality: "active",
        slotId,
        updatedAt: timestamp,
      };
      const restoredEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "restored",
        payload: restoredPayload,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          lifecycleStatus: "active",
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          stage: updatedPlant.stage,
          vitality: "active",
          slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(restoredEvent);

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        restoredEvent,
      };
    },
  );
}
