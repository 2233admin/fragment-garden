import { deriveLocalFragmentTitle, type Fragment, type FragmentEvent, type Plant } from "../domain";
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

export type UpdateFragmentContentInput = {
  fragmentId: string;
  title?: string;
  rawText: string;
};

export type UpdateFragmentContentResult = {
  fragment: Fragment;
  plant: Plant;
  restoredEvent: FragmentEvent | null;
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
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
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
      const stage = fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage;
      const slotId = isArchived ? null : plant.slotId;
      const shouldUpdatePlant =
        plant.vitality !== "active" || plant.stage !== stage || plant.slotId !== slotId;
      const updatedFragment: Fragment = {
        ...fragment,
        title,
        rawText: input.rawText,
        lifecycleStatus: isArchived ? "archived" : "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = shouldUpdatePlant
        ? {
            ...plant,
            stage,
            vitality: "active",
            slotId,
            updatedAt: timestamp,
          }
        : plant;
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
          title,
          rawText: input.rawText,
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

      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        restoredEvent,
      };
    },
  );
}
