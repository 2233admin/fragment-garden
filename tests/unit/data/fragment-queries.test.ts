import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { listFragmentCardViewModels } from "../../../data/queries/fragment-card-query";
import { getFragmentDetailViewModel } from "../../../data/queries/fragment-detail-query";
import {
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("fragment-queries");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("listFragmentCardViewModels", () => {
  it("joins visible text fragments and plants without returning deleted or non-text records", async () => {
    const visibleFragment = createStageTwoFragment({
      id: "visible-fragment",
      rawText: "  第一行\n第二行  ",
    });
    const deletedFragment = createStageTwoFragment({
      id: "deleted-fragment",
      lifecycleStatus: "deleted",
    });
    const linkFragment = createStageTwoFragment({
      id: "link-fragment",
      contentType: "link",
      sourceUrl: "https://example.com",
    });

    await database.fragments.bulkAdd([visibleFragment, deletedFragment, linkFragment]);
    await database.plants.bulkAdd([
      createStageTwoPlant({
        id: "visible-plant",
        fragmentId: visibleFragment.id,
        stage: "growing",
        growthScore: 1,
      }),
      createStageTwoPlant({
        id: "deleted-plant",
        fragmentId: deletedFragment.id,
      }),
      createStageTwoPlant({
        id: "link-plant",
        fragmentId: linkFragment.id,
      }),
    ]);

    await expect(listFragmentCardViewModels(database)).resolves.toEqual([
      {
        id: visibleFragment.id,
        plantId: "visible-plant",
        title: visibleFragment.title,
        rawText: visibleFragment.rawText,
        excerpt: "第一行 第二行",
        createdAt: visibleFragment.createdAt,
        lastInteractedAt: visibleFragment.lastInteractedAt,
        lifecycleStatus: visibleFragment.lifecycleStatus,
        completionStatus: visibleFragment.completionStatus,
        plantStage: "growing",
        growthScore: 1,
      },
    ]);
  });

  it("reports the broken Fragment-to-Plant invariant instead of hiding content", async () => {
    await database.fragments.add(createStageTwoFragment({ id: "fragment-without-plant" }));

    await expect(listFragmentCardViewModels(database)).rejects.toThrow("Plant not found");
  });
});

describe("getFragmentDetailViewModel", () => {
  it("returns validated text supplements in stable occurrence order", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.bulkAdd([
      createStageTwoEvent("text_added", {
        id: "event-b",
        payload: { text: "第二条" },
        occurredAt: "2026-07-24T09:00:00.000Z",
      }),
      createStageTwoEvent("text_added", {
        id: "event-a",
        payload: { text: "第一条" },
        occurredAt: "2026-07-24T09:00:00.000Z",
      }),
      createStageTwoEvent("text_added", {
        id: "invalid-event",
        payload: { unexpected: true },
        occurredAt: "2026-07-24T10:00:00.000Z",
      }),
      createStageTwoEvent("viewed", {
        id: "viewed-event",
        occurredAt: "2026-07-24T11:00:00.000Z",
      }),
    ]);

    await expect(getFragmentDetailViewModel(fragment.id, database)).resolves.toEqual({
      fragment,
      plant,
      textSupplements: [
        {
          id: "event-a",
          text: "第一条",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
        {
          id: "event-b",
          text: "第二条",
          occurredAt: "2026-07-24T09:00:00.000Z",
        },
      ],
    });
  });

  it("returns undefined when the fragment does not exist", async () => {
    await expect(getFragmentDetailViewModel("missing-fragment", database)).resolves.toBeUndefined();
  });
});
