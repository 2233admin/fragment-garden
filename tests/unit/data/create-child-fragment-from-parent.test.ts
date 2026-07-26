import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { createChildFragmentFromParent } from "../../../services/create-child-fragment-from-parent";
import {
  createIdSequence,
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

const NOW = "2026-07-26T08:30:00.000Z";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("create-child");
  await database.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

async function seedParent(
  fragmentOverrides: Parameters<typeof createStageTwoFragment>[0] = {},
  plantOverrides: Parameters<typeof createStageTwoPlant>[0] = {},
): Promise<void> {
  await database.fragments.add(createStageTwoFragment(fragmentOverrides));
  await database.plants.add(createStageTwoPlant(plantOverrides));
  await database.fragmentEvents.add(createStageTwoEvent("created"));
}

describe("createChildFragmentFromParent", () => {
  it("creates an independent child and confirmed child-to-parent relation atomically", async () => {
    await seedParent({}, { slotId: "slot-01" });

    const result = await createChildFragmentFromParent(
      {
        parentFragmentId: "fragment-1",
        title: "  ",
        rawText: "从旧想法长出来的新方向\n先做一个小实验。",
        now: NOW,
      },
      {
        database,
        createId: createIdSequence([
          "child-fragment",
          "child-plant",
          "child-created",
          "parent-child-created",
          "relation-1",
        ]),
      },
    );

    expect(result.childFragment).toMatchObject({
      id: "child-fragment",
      title: "从旧想法长出来的新方向",
      contentMarkdown: "从旧想法长出来的新方向  \n先做一个小实验。",
      lifecycleStatus: "active",
      completionStatus: "open",
      parentFragmentId: "fragment-1",
    });
    expect(result.childPlant).toMatchObject({
      id: "child-plant",
      fragmentId: "child-fragment",
      stage: "seedling",
      growthScore: 0,
      slotId: "slot-02",
    });
    expect(result.childCreatedEvent.type).toBe("created");
    expect(result.parentChildCreatedEvent).toMatchObject({
      type: "child_fragment_created",
      payload: { childFragmentId: "child-fragment" },
    });
    expect(result.relation).toMatchObject({
      sourceFragmentId: "child-fragment",
      targetFragmentId: "fragment-1",
      relationType: "grows_from",
      status: "confirmed",
    });
    expect(result.parentFragment.completionStatus).toBe("open");
    expect(result.parentPlant).toMatchObject({
      growthScore: 2,
      stage: "growing",
    });
  });

  it("restores a dormant parent as a content update", async () => {
    await seedParent({ lifecycleStatus: "dormant" }, { vitality: "dormant", slotId: "slot-01" });

    const result = await createChildFragmentFromParent(
      {
        parentFragmentId: "fragment-1",
        rawText: "一个新的方向",
        now: NOW,
      },
      {
        database,
        createId: createIdSequence([
          "child-fragment",
          "child-plant",
          "child-created",
          "parent-child-created",
          "relation-1",
          "restored-event",
        ]),
      },
    );

    expect(result.parentFragment.lifecycleStatus).toBe("active");
    expect(result.parentPlant.vitality).toBe("active");
    expect(result.restoredEvent).toMatchObject({
      type: "restored",
      payload: { reason: "content_updated" },
    });
  });

  it("lets an archived parent grow a child without returning the parent to the garden", async () => {
    await seedParent({ lifecycleStatus: "archived" }, { slotId: null, vitality: "dormant" });

    const result = await createChildFragmentFromParent(
      {
        parentFragmentId: "fragment-1",
        rawText: "封存内容长出的新想法",
        now: NOW,
      },
      {
        database,
        createId: createIdSequence([
          "child-fragment",
          "child-plant",
          "child-created",
          "parent-child-created",
          "relation-1",
        ]),
      },
    );

    expect(result.parentFragment.lifecycleStatus).toBe("archived");
    expect(result.parentPlant).toMatchObject({
      slotId: null,
      vitality: "active",
      growthScore: 2,
    });
    expect(result.childFragment.lifecycleStatus).toBe("active");
    expect(result.childPlant.slotId).toBe("slot-01");
    expect(result.restoredEvent).toBeNull();
  });

  it("keeps a completed parent permanently blooming while its score changes", async () => {
    await seedParent(
      {
        completionStatus: "completed",
        completedAt: "2026-07-25T08:30:00.000Z",
      },
      { stage: "permanent_bloom" },
    );

    const result = await createChildFragmentFromParent(
      {
        parentFragmentId: "fragment-1",
        rawText: "完成之后又长出的方向",
        now: NOW,
      },
      {
        database,
        createId: createIdSequence([
          "child-fragment",
          "child-plant",
          "child-created",
          "parent-child-created",
          "relation-1",
        ]),
      },
    );

    expect(result.parentFragment.completionStatus).toBe("completed");
    expect(result.parentPlant).toMatchObject({
      stage: "permanent_bloom",
      growthScore: 2,
    });
  });

  it("still creates the child when every garden slot is occupied", async () => {
    await seedParent({}, { slotId: "slot-01" });
    await database.plants.bulkAdd(
      Array.from({ length: 35 }, (_, index) =>
        createStageTwoPlant({
          id: `occupied-plant-${index + 2}`,
          fragmentId: `occupied-fragment-${index + 2}`,
          slotId: `slot-${String(index + 2).padStart(2, "0")}`,
        }),
      ),
    );

    const result = await createChildFragmentFromParent(
      {
        parentFragmentId: "fragment-1",
        rawText: "没有空槽也要保存",
        now: NOW,
      },
      {
        database,
        createId: createIdSequence([
          "child-fragment",
          "child-plant",
          "child-created",
          "parent-child-created",
          "relation-1",
        ]),
      },
    );

    expect(result.childPlant.slotId).toBeNull();
    await expect(database.fragments.get("child-fragment")).resolves.toBeDefined();
  });

  it("rolls back every write when the relation cannot be stored", async () => {
    await seedParent();
    vi.spyOn(database.relations, "add").mockRejectedValueOnce(
      new Error("simulated relation failure"),
    );

    await expect(
      createChildFragmentFromParent(
        {
          parentFragmentId: "fragment-1",
          rawText: "这条不会被部分保存",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence([
            "child-fragment",
            "child-plant",
            "child-created",
            "parent-child-created",
            "relation-1",
          ]),
        },
      ),
    ).rejects.toThrow("simulated relation failure");

    await expect(database.fragments.get("child-fragment")).resolves.toBeUndefined();
    await expect(database.plants.get("child-plant")).resolves.toBeUndefined();
    await expect(database.relations.count()).resolves.toBe(0);
    await expect(database.fragments.get("fragment-1")).resolves.toMatchObject({
      lastInteractedAt: "2026-07-23T08:30:00.000Z",
    });
    await expect(database.plants.get("plant-1")).resolves.toMatchObject({
      growthScore: 0,
      stage: "seedling",
    });
    await expect(
      database.fragmentEvents.where("fragmentId").equals("fragment-1").count(),
    ).resolves.toBe(1);
  });

  it("rejects a deleted parent before creating anything", async () => {
    await seedParent({ lifecycleStatus: "deleted" }, { slotId: null });

    await expect(
      createChildFragmentFromParent(
        {
          parentFragmentId: "fragment-1",
          rawText: "不应创建",
          now: NOW,
        },
        { database, createId: () => crypto.randomUUID() },
      ),
    ).rejects.toThrow("cannot be changed");

    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.relations.count()).resolves.toBe(0);
  });
});
