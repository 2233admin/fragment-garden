import type { Fragment, FragmentEvent, Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  parseArchivedEventPayload,
  parseReviewedEventPayload,
} from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type ArchiveFragmentInput = Readonly<{
  fragmentId: string;
  now: string;
  reviewDecision?: "no_longer_needed";
}>;

export type ArchiveFragmentResult = Readonly<{
  fragment: Fragment;
  plant: Plant;
  archivedEvent: FragmentEvent | null;
  reviewedEvent: FragmentEvent | null;
}>;

export async function archiveFragment(
  input: ArchiveFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<ArchiveFragmentResult> {
  if (input.reviewDecision !== undefined && input.reviewDecision !== "no_longer_needed") {
    throw new Error(`Unsupported archive review decision: ${String(input.reviewDecision)}`);
  }

  const reviewedPayload =
    input.reviewDecision === undefined
      ? null
      : parseReviewedEventPayload({ decision: input.reviewDecision });
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

      if (fragment.lifecycleStatus === "archived") {
        const repairedPlant: Plant = {
          ...plant,
          stage: fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage,
          vitality: "active",
          slotId: null,
          updatedAt:
            plant.slotId === null &&
            plant.vitality === "active" &&
            (fragment.completionStatus !== "completed" || plant.stage === "permanent_bloom")
              ? plant.updatedAt
              : timestamp,
        };

        if (
          repairedPlant.slotId !== plant.slotId ||
          repairedPlant.vitality !== plant.vitality ||
          repairedPlant.stage !== plant.stage
        ) {
          requireRecordUpdated(
            await plantRepository.update(plant.id, {
              stage: repairedPlant.stage,
              vitality: "active",
              slotId: null,
              updatedAt: repairedPlant.updatedAt,
            }),
            "Plant",
          );
        }

        return {
          fragment,
          plant: repairedPlant,
          archivedEvent: null,
          reviewedEvent: null,
        };
      }

      const archivedPayload = parseArchivedEventPayload({
        previousSlotId: plant.slotId,
      });
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: "archived",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        stage: fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage,
        vitality: "active",
        slotId: null,
        updatedAt: timestamp,
      };
      const archivedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "archived",
        payload: archivedPayload,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const reviewedEvent: FragmentEvent | null =
        reviewedPayload === null
          ? null
          : {
              id: createId(),
              fragmentId: fragment.id,
              type: "reviewed",
              payload: reviewedPayload,
              occurredAt: timestamp,
              ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
            };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          lifecycleStatus: "archived",
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          stage: updatedPlant.stage,
          vitality: "active",
          slotId: null,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(archivedEvent);
      if (reviewedEvent !== null) {
        await fragmentEventRepository.add(reviewedEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        archivedEvent,
        reviewedEvent,
      };
    },
  );
}
