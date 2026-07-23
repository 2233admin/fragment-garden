import type { Fragment, FragmentEvent, Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  parseCompletedEventPayload,
  parseRestoredEventPayload,
} from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type CompleteFragmentInput = Readonly<{
  fragmentId: string;
  outcome?: string | null;
  now: string;
}>;

export type CompleteFragmentResult = Readonly<{
  fragment: Fragment;
  plant: Plant;
  completedEvent: FragmentEvent | null;
  restoredEvent: FragmentEvent | null;
}>;

export async function completeFragment(
  input: CompleteFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<CompleteFragmentResult> {
  const completedPayload = parseCompletedEventPayload({
    outcome: input.outcome ?? null,
  });
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
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

      const lifecycleStatus = fragment.lifecycleStatus === "archived" ? "archived" : "active";
      const slotId = lifecycleStatus === "archived" ? null : plant.slotId;

      if (fragment.completionStatus === "completed") {
        const repairedFragment: Fragment = {
          ...fragment,
          lifecycleStatus,
          updatedAt: fragment.lifecycleStatus === lifecycleStatus ? fragment.updatedAt : timestamp,
        };
        const repairedPlant: Plant = {
          ...plant,
          stage: "permanent_bloom",
          vitality: "active",
          slotId,
          updatedAt:
            plant.stage === "permanent_bloom" &&
            plant.vitality === "active" &&
            plant.slotId === slotId
              ? plant.updatedAt
              : timestamp,
        };

        if (repairedFragment.lifecycleStatus !== fragment.lifecycleStatus) {
          requireRecordUpdated(
            await fragmentRepository.update(fragment.id, {
              lifecycleStatus,
              updatedAt: repairedFragment.updatedAt,
            }),
            "Fragment",
          );
        }

        if (
          repairedPlant.stage !== plant.stage ||
          repairedPlant.vitality !== plant.vitality ||
          repairedPlant.slotId !== plant.slotId
        ) {
          requireRecordUpdated(
            await plantRepository.update(plant.id, {
              stage: "permanent_bloom",
              vitality: "active",
              slotId,
              updatedAt: repairedPlant.updatedAt,
            }),
            "Plant",
          );
        }

        return {
          fragment: repairedFragment,
          plant: repairedPlant,
          completedEvent: null,
          restoredEvent: null,
        };
      }

      const wasDormant = fragment.lifecycleStatus === "dormant";
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus,
        completionStatus: "completed",
        completedAt: timestamp,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        stage: "permanent_bloom",
        vitality: "active",
        slotId,
        updatedAt: timestamp,
      };
      const completedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "completed",
        payload: completedPayload,
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
          lifecycleStatus,
          completionStatus: "completed",
          completedAt: timestamp,
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          stage: "permanent_bloom",
          vitality: "active",
          slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(completedEvent);
      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        completedEvent,
        restoredEvent,
      };
    },
  );
}
