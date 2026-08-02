import type { Fragment, FragmentEvent, FragmentReviewDecision, Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  parseRestoredEventPayload,
  parseReviewedEventPayload,
} from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type ReviewFragmentDecision = Exclude<FragmentReviewDecision, "no_longer_needed">;

export type ReviewFragmentInput = Readonly<{
  fragmentId: string;
  decision: ReviewFragmentDecision;
  now: string;
}>;

export type ReviewFragmentResult = Readonly<{
  fragment: Fragment;
  plant: Plant;
  reviewedEvent: FragmentEvent;
  lifecycleEvent: FragmentEvent | null;
}>;

export async function reviewFragment(
  input: ReviewFragmentInput,
  dependencies: LocalServiceDependencies = {},
): Promise<ReviewFragmentResult> {
  if (input.decision !== "still_interested" && input.decision !== "not_now") {
    throw new Error(`Unsupported fragment review decision: ${String(input.decision)}`);
  }

  const reviewedPayload = parseReviewedEventPayload({ decision: input.decision });
  const restoredPayload = parseRestoredEventPayload({ reason: "reviewed" });
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

      if (input.decision === "not_now" && fragment.completionStatus === "completed") {
        throw new Error(`Completed fragment ${fragment.id} cannot be marked not now`);
      }

      if (input.decision === "not_now" && fragment.lifecycleStatus === "archived") {
        throw new Error(`Archived fragment ${fragment.id} cannot be marked not now`);
      }

      const isArchived = fragment.lifecycleStatus === "archived";
      const wasDormant = fragment.lifecycleStatus === "dormant";
      const lifecycleStatus = isArchived
        ? "archived"
        : input.decision === "not_now"
          ? "dormant"
          : "active";
      const vitality = isArchived || input.decision === "still_interested" ? "active" : "dormant";
      const slotId = isArchived ? null : plant.slotId;
      const stage = fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage;
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus,
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        stage,
        vitality,
        slotId,
        updatedAt: timestamp,
      };
      const reviewedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "reviewed",
        payload: reviewedPayload,
        occurredAt: timestamp,
        ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
      };
      const lifecycleEvent: FragmentEvent | null =
        !isArchived && input.decision === "not_now" && !wasDormant
          ? {
              id: createId(),
              fragmentId: fragment.id,
              type: "dormant",
              payload: null,
              occurredAt: timestamp,
              ruleVersion: CURRENT_FRAGMENT_EVENT_RULE_VERSION,
            }
          : !isArchived && input.decision === "still_interested" && wasDormant
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
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          stage,
          vitality,
          slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(reviewedEvent);
      if (lifecycleEvent !== null) {
        await fragmentEventRepository.add(lifecycleEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        reviewedEvent,
        lifecycleEvent,
      };
    },
  );
}
