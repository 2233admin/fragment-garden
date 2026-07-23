import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { updateFragmentContent } from "../../../services/update-fragment-content";
import {
  STAGE_TWO_TEST_DATE,
  STAGE_TWO_TEST_TIMESTAMP,
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("update-content");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("updateFragmentContent", () => {
  it("updates title and raw text without adding growth events", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({
      vitality: "dormant",
      stage: "growing",
      growthScore: 2,
    });
    const existingEvent = createStageTwoEvent("created");
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(existingEvent);

    const result = await updateFragmentContent(
      {
        fragmentId: fragment.id,
        title: "  修改后的标题  ",
        rawText: "  保留正文格式\n以及换行  ",
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment).toMatchObject({
      title: "修改后的标题",
      rawText: "  保留正文格式\n以及换行  ",
      lifecycleStatus: "active",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.plant).toMatchObject({
      vitality: "active",
      stage: "growing",
      growthScore: 2,
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
  });

  it("derives a replacement title when the submitted title is blank", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await updateFragmentContent(
      {
        fragmentId: fragment.id,
        title: "   ",
        rawText: "\n  新的   第一行  \n第二行",
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment.title).toBe("新的 第一行");
  });

  it("rejects empty text without changing persisted data", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await expect(
      updateFragmentContent(
        { fragmentId: fragment.id, rawText: " \n\t " },
        { database, now: () => STAGE_TWO_TEST_DATE },
      ),
    ).rejects.toThrow("cannot be empty");

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });

  it("rolls back the fragment update when dormant plant restoration fails", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    database.plants.hook("updating", () => {
      throw new Error("Injected plant update failure");
    });

    await expect(
      updateFragmentContent(
        {
          fragmentId: fragment.id,
          title: "不应保存",
          rawText: "不应保存的正文",
        },
        { database, now: () => STAGE_TWO_TEST_DATE },
      ),
    ).rejects.toThrow("Injected plant update failure");

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });
});
