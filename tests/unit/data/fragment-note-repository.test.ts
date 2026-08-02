import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { FragmentNoteRepository } from "../../../data/repositories/fragment-note-repository";
import type { FragmentNote } from "../../../domain";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-note-repository-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

function note(id: string, fragmentId: string, createdAt: string): FragmentNote {
  return {
    id,
    fragmentId,
    contentMarkdown: `笔记 ${id}`,
    source: "user",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("FragmentNoteRepository", () => {
  it("lists only the requested fragment in stable createdAt and id order", async () => {
    const repository = new FragmentNoteRepository(database);
    await database.fragmentNotes.bulkAdd([
      note("note-b", "fragment-1", "2026-07-24T09:00:00.000Z"),
      note("note-c", "fragment-2", "2026-07-24T08:00:00.000Z"),
      note("note-a", "fragment-1", "2026-07-24T09:00:00.000Z"),
      note("note-old", "fragment-1", "2026-07-23T09:00:00.000Z"),
    ]);

    await expect(repository.listByFragmentId("fragment-1")).resolves.toMatchObject([
      { id: "note-old" },
      { id: "note-a" },
      { id: "note-b" },
    ]);
  });

  it("supports add, update, get, and delete without touching another note", async () => {
    const repository = new FragmentNoteRepository(database);
    const first = note("note-1", "fragment-1", "2026-07-24T08:00:00.000Z");
    const second = note("note-2", "fragment-1", "2026-07-24T09:00:00.000Z");
    await repository.add(first);
    await repository.add(second);

    await repository.update(first.id, {
      contentMarkdown: "修改后",
      updatedAt: "2026-07-25T08:00:00.000Z",
    });
    await expect(repository.getById(first.id)).resolves.toMatchObject({
      contentMarkdown: "修改后",
      createdAt: first.createdAt,
    });

    await repository.delete(first.id);
    await expect(repository.getById(first.id)).resolves.toBeUndefined();
    await expect(repository.getById(second.id)).resolves.toEqual(second);
  });
});
