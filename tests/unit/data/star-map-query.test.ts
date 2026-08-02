import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { queryStarMapSnapshot } from "../../../data/queries/star-map-query";
import { deriveStarBrightness, deriveStarPosition } from "../../../domain";
import type { FragmentNote } from "../../../domain";
import { createStageTwoFragment } from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`star-map-query-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

function createNote(id: string, fragmentId: string): FragmentNote {
  return {
    id,
    fragmentId,
    contentMarkdown: `追加 ${id}`,
    source: "user",
    createdAt: `2026-07-24T0${id.endsWith("1") ? "8" : "9"}:00:00.000Z`,
    updatedAt: `2026-07-24T0${id.endsWith("1") ? "8" : "9"}:00:00.000Z`,
  };
}

describe("queryStarMapSnapshot", () => {
  it("derives visible content stars and note brightness without plants, slots, or relations", async () => {
    const active = createStageTwoFragment({
      id: "fragment-active",
      title: "会点亮的记录",
      createdAt: "2026-07-23T08:00:00.000Z",
    });
    const archived = createStageTwoFragment({
      id: "fragment-archived",
      lifecycleStatus: "archived",
      createdAt: "2026-07-23T09:00:00.000Z",
    });
    const deleted = createStageTwoFragment({
      id: "fragment-deleted",
      lifecycleStatus: "deleted",
      createdAt: "2026-07-23T10:00:00.000Z",
    });

    await database.fragments.bulkAdd([deleted, archived, active]);
    await database.fragmentNotes.bulkAdd([
      createNote("note-1", active.id),
      createNote("note-2", active.id),
      createNote("note-deleted", deleted.id),
    ]);

    const snapshot = await queryStarMapSnapshot(database);

    expect(snapshot.contentStarCount).toBe(2);
    expect(snapshot.stars.map((star) => star.fragmentId)).toEqual([active.id, archived.id]);
    expect(snapshot.stars[0]).toMatchObject({
      fragmentId: active.id,
      title: active.title,
      userNoteCount: 2,
      brightness: deriveStarBrightness(2),
      position: deriveStarPosition(active.id),
    });
    expect(snapshot.stars[1]).toMatchObject({
      fragmentId: archived.id,
      userNoteCount: 0,
      brightness: deriveStarBrightness(0),
    });
    expect(snapshot.rotationSpeedRadiansPerSecond).toBeGreaterThan(0);
    expect(await database.plants.count()).toBe(0);
    expect(await database.relations.count()).toBe(0);
  });
});
