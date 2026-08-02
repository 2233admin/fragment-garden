import {
  calculateGrowthScore,
  resolvePlantStage,
  type Fragment,
  type FragmentEvent,
  type PartnerSuggestion,
  type PartnerSuggestionSavedEventPayload,
  type Plant,
  type SproutRecommendedAction,
} from "../domain";
import { createLocalDateKey } from "../domain/sprout/local-date";
import { isSproutRecommendedActionAllowed } from "../domain/sprout/recommended-actions";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  parsePartnerSuggestionSavedEventPayload,
  parseRestoredEventPayload,
  safelyParsePartnerSuggestionSavedEventPayload,
} from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type SavePartnerSuggestionInput = Readonly<{
  fragmentId: string;
  suggestionId: string;
  direction: string;
  guidingQuestion: string;
  recommendedAction: SproutRecommendedAction;
  promptVersion: string;
  now: string;
}>;

export type SavePartnerSuggestionResult = Readonly<{
  fragment: Fragment;
  plant: Plant;
  suggestion: PartnerSuggestion;
  partnerSuggestionSavedEvent: FragmentEvent;
  restoredEvent: FragmentEvent | null;
  didAwardGrowth: boolean;
}>;

function toPartnerSuggestion(
  event: FragmentEvent,
  payload: PartnerSuggestionSavedEventPayload,
): PartnerSuggestion {
  return {
    id: event.id,
    fragmentId: event.fragmentId,
    direction: payload.direction,
    guidingQuestion: payload.guidingQuestion,
    recommendedAction: payload.recommendedAction,
    source: "partner",
    createdAt: event.occurredAt,
    promptVersion: payload.promptVersion,
  };
}

function isSameSuggestion(
  payload: PartnerSuggestionSavedEventPayload,
  expected: PartnerSuggestionSavedEventPayload,
): boolean {
  return (
    payload.direction === expected.direction &&
    payload.guidingQuestion === expected.guidingQuestion &&
    payload.recommendedAction === expected.recommendedAction &&
    payload.source === expected.source &&
    payload.promptVersion === expected.promptVersion
  );
}

export async function savePartnerSuggestion(
  input: SavePartnerSuggestionInput,
  dependencies: LocalServiceDependencies = {},
): Promise<SavePartnerSuggestionResult> {
  const suggestionId = input.suggestionId.trim();
  if (suggestionId.length === 0) {
    throw new Error("A suggestion id is required");
  }

  const now = new Date(input.now);
  const payload = parsePartnerSuggestionSavedEventPayload({
    direction: input.direction,
    guidingQuestion: input.guidingQuestion,
    recommendedAction: input.recommendedAction,
    source: "partner",
    promptVersion: input.promptVersion,
    localDateKey: createLocalDateKey(now),
  });
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => now,
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
      const [fragment, plant, existingSavedEvent, existingEvents] = await Promise.all([
        fragmentRepository.getById(input.fragmentId),
        plantRepository.getByFragmentId(input.fragmentId),
        fragmentEventRepository.getById(suggestionId),
        fragmentEventRepository.listByFragmentId(input.fragmentId),
      ]);

      if (fragment === undefined) {
        throw new Error(`Fragment ${input.fragmentId} was not found`);
      }

      if (plant === undefined) {
        throw new Error(`Plant for fragment ${input.fragmentId} was not found`);
      }

      requireFragmentCanInteract(fragment);

      if (existingSavedEvent !== undefined) {
        const existingPayload =
          existingSavedEvent.type === "partner_suggestion_saved"
            ? safelyParsePartnerSuggestionSavedEventPayload(existingSavedEvent.payload)
            : null;

        if (
          existingSavedEvent.fragmentId !== fragment.id ||
          existingPayload === null ||
          !isSameSuggestion(existingPayload, payload)
        ) {
          throw new Error(`Suggestion id ${suggestionId} is already in use`);
        }

        return {
          fragment,
          plant,
          suggestion: toPartnerSuggestion(existingSavedEvent, existingPayload),
          partnerSuggestionSavedEvent: existingSavedEvent,
          restoredEvent: null,
          didAwardGrowth: false,
        };
      }

      if (
        !isSproutRecommendedActionAllowed(payload.recommendedAction, {
          completionStatus: fragment.completionStatus,
          lifecycleStatus: fragment.lifecycleStatus,
        })
      ) {
        throw new Error("The suggested action is not compatible with the current fragment state");
      }

      const wasDormant = fragment.lifecycleStatus === "dormant";
      const isArchived = fragment.lifecycleStatus === "archived";
      const partnerSuggestionSavedEvent: FragmentEvent = {
        id: suggestionId,
        fragmentId: fragment.id,
        type: "partner_suggestion_saved",
        payload,
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
      const previousGrowthScore = calculateGrowthScore(existingEvents);
      const eventsAfterSave =
        restoredEvent === null
          ? [...existingEvents, partnerSuggestionSavedEvent]
          : [...existingEvents, partnerSuggestionSavedEvent, restoredEvent];
      const growthScore = calculateGrowthScore(eventsAfterSave);
      const stage = resolvePlantStage(eventsAfterSave, fragment.completionStatus);
      const updatedFragment: Fragment = {
        ...fragment,
        lifecycleStatus: isArchived ? "archived" : "active",
        updatedAt: timestamp,
        lastInteractedAt: timestamp,
      };
      const updatedPlant: Plant = {
        ...plant,
        stage,
        vitality: "active",
        growthScore,
        slotId: isArchived ? null : plant.slotId,
        updatedAt: timestamp,
      };

      requireRecordUpdated(
        await fragmentRepository.update(fragment.id, {
          lifecycleStatus: updatedFragment.lifecycleStatus,
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plantRepository.update(plant.id, {
          stage,
          vitality: "active",
          growthScore,
          slotId: updatedPlant.slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      await fragmentEventRepository.add(partnerSuggestionSavedEvent);
      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      return {
        fragment: updatedFragment,
        plant: updatedPlant,
        suggestion: toPartnerSuggestion(partnerSuggestionSavedEvent, payload),
        partnerSuggestionSavedEvent,
        restoredEvent,
        didAwardGrowth: growthScore > previousGrowthScore,
      };
    },
  );
}
