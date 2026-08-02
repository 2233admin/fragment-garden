import type { Fragment, FragmentEvent, FragmentNote, Plant } from "../domain";
import { FragmentEventRepository } from "../data/repositories/fragment-event-repository";
import { FragmentNoteRepository } from "../data/repositories/fragment-note-repository";
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

export type DeleteFragmentNoteResult = Readonly<{
  deletedNote: FragmentNote;
  fragment: Fragment;
  plant: Plant;
  restoredEvent: FragmentEvent | null;
}>;

export type DeleteFragmentNoteInput = Readonly<{
  noteId: string;
}>;

export async function deleteFragmentNote(
  input: DeleteFragmentNoteInput,
  dependencies: LocalServiceDependencies = {},
): Promise<DeleteFragmentNoteResult> {
  const restoredPayload = parseRestoredEventPayload({ reason: "content_updated" });
  const { database, createId, timestamp } = resolveLocalServiceDependencies(dependencies);
  const notes = new FragmentNoteRepository(database);
  const fragments = new FragmentRepository(database);
  const plants = new PlantRepository(database);
  const events = new FragmentEventRepository(database);

  return database.transaction(
    "rw",
    [database.fragmentNotes, database.fragments, database.plants, database.fragmentEvents],
    async () => {
      const note = await notes.getById(input.noteId);
      if (note === undefined) throw new Error(`Fragment note ${input.noteId} was not found`);

      const [fragment, plant] = await Promise.all([
        fragments.getById(note.fragmentId),
        plants.getByFragmentId(note.fragmentId),
      ]);
      if (fragment === undefined) throw new Error(`Fragment ${note.fragmentId} was not found`);
      if (plant === undefined) {
        throw new Error(`Plant for fragment ${note.fragmentId} was not found`);
      }
      requireFragmentCanInteract(fragment);

      const wasDormant = fragment.lifecycleStatus === "dormant";
      const isArchived = fragment.lifecycleStatus === "archived";
      const stage = fragment.completionStatus === "completed" ? "permanent_bloom" : plant.stage;
      const slotId = isArchived ? null : plant.slotId;
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
        slotId,
        updatedAt: timestamp,
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

      await notes.delete(note.id);
      requireRecordUpdated(
        await fragments.update(fragment.id, {
          lifecycleStatus: updatedFragment.lifecycleStatus,
          updatedAt: timestamp,
          lastInteractedAt: timestamp,
        }),
        "Fragment",
      );
      requireRecordUpdated(
        await plants.update(plant.id, {
          stage,
          vitality: "active",
          slotId,
          updatedAt: timestamp,
        }),
        "Plant",
      );
      if (restoredEvent !== null) await events.add(restoredEvent);

      return { deletedNote: note, fragment: updatedFragment, plant: updatedPlant, restoredEvent };
    },
  );
}
