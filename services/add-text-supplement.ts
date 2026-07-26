import {
  calculateGrowthScore,
  normalizeContentMarkdown,
  resolvePlantStage,
  type Fragment,
  type FragmentEvent,
  type FragmentNote,
  type Plant,
} from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentNoteRepository } from "../data/repositories/fragment-note-repository";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { PlantRepository } from "../data/repositories/plant-repository";
import {
  parseRestoredEventPayload,
  parseTextAddedEventPayload,
} from "../validation/fragment-event-payload";
import {
  CURRENT_FRAGMENT_EVENT_RULE_VERSION,
  type LocalServiceDependencies,
  requireFragmentCanInteract,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AddTextSupplementInput = {
  fragmentId: string;
  contentMarkdown: string;
};

export type AddTextSupplementResult = {
  fragment: Fragment;
  note: FragmentNote;
  plant: Plant;
  textAddedEvent: FragmentEvent;
  restoredEvent: FragmentEvent | null;
};

export async function addTextSupplement(
  input: AddTextSupplementInput,
  dependencies: LocalServiceDependencies = {},
): Promise<AddTextSupplementResult> {
  const contentMarkdown = normalizeContentMarkdown(input.contentMarkdown);
  const payload = parseTextAddedEventPayload({ text: contentMarkdown });
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const fragmentRepository = new FragmentRepository(database);
  const plantRepository = new PlantRepository(database);
  const fragmentEventRepository = new FragmentEventRepository(database);
  const fragmentNoteRepository = new FragmentNoteRepository(database);

  return database.transaction(
    "rw",
    database.fragments,
    database.plants,
    database.fragmentEvents,
    database.fragmentNotes,
    async () => {
      const [fragment, plant, existingEvents] = await Promise.all([
        fragmentRepository.getById(input.fragmentId),
        plantRepository.getByFragmentId(input.fragmentId),
        fragmentEventRepository.listByFragmentId(input.fragmentId),
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
      const note: FragmentNote = {
        id: createId(),
        fragmentId: fragment.id,
        contentMarkdown,
        source: "user",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const textAddedEvent: FragmentEvent = {
        id: createId(),
        fragmentId: fragment.id,
        type: "text_added",
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
      const eventsAfterAddition =
        restoredEvent === null
          ? [...existingEvents, textAddedEvent]
          : [...existingEvents, textAddedEvent, restoredEvent];
      const growthScore = calculateGrowthScore(eventsAfterAddition);
      const stage = resolvePlantStage(eventsAfterAddition, fragment.completionStatus);
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
      await fragmentEventRepository.add(textAddedEvent);
      await fragmentNoteRepository.add(note);
      if (restoredEvent !== null) {
        await fragmentEventRepository.add(restoredEvent);
      }

      return {
        fragment: updatedFragment,
        note,
        plant: updatedPlant,
        textAddedEvent,
        restoredEvent,
      };
    },
  );
}
