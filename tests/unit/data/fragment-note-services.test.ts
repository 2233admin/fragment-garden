import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FragmentNote } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { deleteFragmentNote } from "../../../services/delete-fragment-note";
import { updateFragmentNote } from "../../../services/update-fragment-note";
import {
  STAGE_TWO_TEST_DATE,
  STAGE_TWO_TEST_TIMESTAMP,
  createIdSequence,
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

function createNote(overrides: Partial<FragmentNote> = {}): FragmentNote {
  return {
    id: "note-1",
    fragmentId: "fragment-1",
    contentMarkdown: "原始追加笔记",
    source: "user",
    createdAt: "2026-07-23T08:45:00.000Z",
    updatedAt: "2026-07-23T08:45:00.000Z",
    ...overrides,
  };
}

beforeEach(async () => {
  database = createStageTwoDatabase("fragment-note-services");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("updateFragmentNote", () => {
  it("edits an independent note and restores a dormant fragment without changing its body", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant", growthScore: 2, stage: "growing" });
    const note = createNote();
    const textAddedEvent = createStageTwoEvent("text_added", {
      id: "original-text-event",
      payload: { text: note.contentMarkdown },
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);
    await database.fragmentEvents.add(textAddedEvent);

    const result = await updateFragmentNote(
      { noteId: note.id, contentMarkdown: "  ## 修改后的补充  " },
      {
        database,
        createId: createIdSequence(["restored-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.note).toEqual({
      ...note,
      contentMarkdown: "## 修改后的补充",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.fragment).toMatchObject({
      contentMarkdown: fragment.contentMarkdown,
      rawText: fragment.rawText,
      lifecycleStatus: "active",
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.plant).toMatchObject({
      growthScore: 2,
      stage: "growing",
      vitality: "active",
    });
    expect(result.restoredEvent).toMatchObject({
      id: "restored-event",
      type: "restored",
    });
    await expect(database.fragmentEvents.where("type").equals("text_added").count()).resolves.toBe(
      1,
    );
    await expect(database.fragmentNotes.get(note.id)).resolves.toEqual(result.note);
  });

  it("keeps archived and completed state while editing a note", async () => {
    const fragment = createStageTwoFragment({
      lifecycleStatus: "archived",
      completionStatus: "completed",
      completedAt: "2026-07-23T09:00:00.000Z",
    });
    const plant = createStageTwoPlant({
      slotId: null,
      stage: "permanent_bloom",
      growthScore: 4,
    });
    const note = createNote();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);

    const result = await updateFragmentNote(
      { noteId: note.id, contentMarkdown: "封存完成后的修改" },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "archived",
      completionStatus: "completed",
    });
    expect(result.plant).toMatchObject({
      slotId: null,
      stage: "permanent_bloom",
      growthScore: 4,
    });
    expect(result.restoredEvent).toBeNull();
  });

  it("rejects empty content and deleted fragments without changing the note", async () => {
    const deletedFragment = createStageTwoFragment({ lifecycleStatus: "deleted" });
    const plant = createStageTwoPlant({ slotId: null });
    const note = createNote();
    await database.fragments.add(deletedFragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);

    await expect(
      updateFragmentNote(
        { noteId: note.id, contentMarkdown: " \n\t " },
        { database, now: () => STAGE_TWO_TEST_DATE },
      ),
    ).rejects.toThrow("cannot be empty");
    await expect(
      updateFragmentNote(
        { noteId: note.id, contentMarkdown: "不得写回" },
        { database, now: () => STAGE_TWO_TEST_DATE },
      ),
    ).rejects.toThrow("Deleted fragment");

    await expect(database.fragmentNotes.get(note.id)).resolves.toEqual(note);
    await expect(database.fragments.get(deletedFragment.id)).resolves.toEqual(deletedFragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });

  it("rolls back the note edit when the related plant update fails", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    const note = createNote();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);
    database.plants.hook("updating", () => {
      throw new Error("Injected plant update failure");
    });

    await expect(
      updateFragmentNote(
        { noteId: note.id, contentMarkdown: "不应保存" },
        {
          database,
          createId: createIdSequence(["unused-restored-event"]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toThrow("Injected plant update failure");

    await expect(database.fragmentNotes.get(note.id)).resolves.toEqual(note);
    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });
});

describe("deleteFragmentNote", () => {
  it("deletes only the note and does not reverse its historical growth event", async () => {
    const fragment = createStageTwoFragment({
      lifecycleStatus: "archived",
      completionStatus: "completed",
      completedAt: "2026-07-23T09:00:00.000Z",
    });
    const plant = createStageTwoPlant({
      slotId: null,
      stage: "permanent_bloom",
      growthScore: 3,
    });
    const note = createNote();
    const textAddedEvent = createStageTwoEvent("text_added", {
      id: "retained-text-event",
      payload: { text: note.contentMarkdown },
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);
    await database.fragmentEvents.add(textAddedEvent);

    const result = await deleteFragmentNote(
      { noteId: note.id },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.deletedNote).toEqual(note);
    expect(result.fragment).toMatchObject({
      lifecycleStatus: "archived",
      completionStatus: "completed",
    });
    expect(result.plant).toMatchObject({
      slotId: null,
      stage: "permanent_bloom",
      growthScore: 3,
    });
    await expect(database.fragmentNotes.get(note.id)).resolves.toBeUndefined();
    await expect(database.fragmentEvents.get(textAddedEvent.id)).resolves.toEqual(textAddedEvent);
  });

  it("restores a dormant fragment when its note is deleted", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    const note = createNote();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);

    const result = await deleteFragmentNote(
      { noteId: note.id },
      {
        database,
        createId: createIdSequence(["delete-restored-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment.lifecycleStatus).toBe("active");
    expect(result.plant.vitality).toBe("active");
    expect(result.restoredEvent).toMatchObject({
      id: "delete-restored-event",
      payload: { reason: "content_updated" },
    });
  });

  it("rejects deleted fragments and rolls back a failed deletion", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "deleted" });
    const plant = createStageTwoPlant({ slotId: null });
    const note = createNote();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentNotes.add(note);

    await expect(
      deleteFragmentNote({ noteId: note.id }, { database, now: () => STAGE_TWO_TEST_DATE }),
    ).rejects.toThrow("Deleted fragment");
    await expect(database.fragmentNotes.get(note.id)).resolves.toEqual(note);

    await database.fragments.update(fragment.id, { lifecycleStatus: "active" });
    database.fragments.hook("updating", () => {
      throw new Error("Injected fragment update failure");
    });
    await expect(
      deleteFragmentNote({ noteId: note.id }, { database, now: () => STAGE_TWO_TEST_DATE }),
    ).rejects.toThrow("Injected fragment update failure");

    await expect(database.fragmentNotes.get(note.id)).resolves.toEqual(note);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });
});
