import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { getMemoryStarDetailViewModel } from "../../../data/queries/memory-star-detail-query";
import type { FragmentNote } from "../../../domain";
import { createStageTwoFragment } from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`memory-star-detail-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("getMemoryStarDetailViewModel", () => {
  it("reads a visible fragment and its notes without requiring a legacy plant", async () => {
    const fragment = createStageTwoFragment({
      id: "fragment-without-plant",
      contentMarkdown: "星空详情正文",
      rawText: "星空详情正文",
      title: "没有植物也能打开",
    });
    const note: FragmentNote = {
      id: "note-1",
      fragmentId: fragment.id,
      contentMarkdown: "一条后续补充",
      source: "user",
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
    };

    await database.fragments.add(fragment);
    await database.fragmentNotes.add(note);

    await expect(getMemoryStarDetailViewModel(fragment.id, database)).resolves.toEqual({
      fragment,
      contentMarkdown: fragment.contentMarkdown,
      notes: [note],
      mediaAsset: null,
      externalLinkImport: null,
    });
    await expect(database.plants.count()).resolves.toBe(0);
  });

  it("does not expose deleted fragments as content-star details", async () => {
    const deletedFragment = createStageTwoFragment({
      id: "deleted-fragment",
      lifecycleStatus: "deleted",
    });
    await database.fragments.add(deletedFragment);

    await expect(
      getMemoryStarDetailViewModel(deletedFragment.id, database),
    ).resolves.toBeUndefined();
  });
});
