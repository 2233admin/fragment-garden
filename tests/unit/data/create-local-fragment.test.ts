import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLANT_SLOT_IDS, type FragmentEvent, type Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { createLocalFragment } from "../../../services/create-local-fragment";

const TEST_DATE = new Date("2026-07-23T06:30:00.000Z");
const TEST_TIMESTAMP = TEST_DATE.toISOString();

let database: FragmentGardenDatabase;

function createIdSequence(ids: readonly string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (id === undefined) {
      throw new Error("Test ID sequence exhausted");
    }

    return id;
  };
}

function createOccupiedPlant(slotId: string, index: number): Plant {
  return {
    id: `occupied-plant-${index}`,
    fragmentId: `occupied-fragment-${index}`,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId,
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-create-fragment-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("createLocalFragment", () => {
  it("derives a title when the optional title is omitted", async () => {
    const result = await createLocalFragment(
      {
        rawText: "\n  自动   生成标题  \n不会使用第二行",
      },
      {
        database,
        createId: createIdSequence(["fragment-title", "plant-title", "event-title"]),
        now: () => TEST_DATE,
      },
    );

    expect(result.fragment.title).toBe("自动 生成标题");
    expect(result.fragment.rawText).toBe("\n  自动   生成标题  \n不会使用第二行");
  });

  it("preserves a manually supplied non-empty title", async () => {
    const result = await createLocalFragment(
      {
        title: "  用户标题  ",
        rawText: "正文第一行",
      },
      {
        database,
        createId: createIdSequence([
          "fragment-manual-title",
          "plant-manual-title",
          "event-manual-title",
        ]),
        now: () => TEST_DATE,
      },
    );

    expect(result.fragment.title).toBe("用户标题");
  });

  it("rejects whitespace-only text without writing records", async () => {
    await expect(
      createLocalFragment(
        { rawText: " \n\t " },
        {
          database,
          createId: createIdSequence(["fragment-empty", "plant-empty", "event-empty"]),
          now: () => TEST_DATE,
        },
      ),
    ).rejects.toThrow("cannot be empty");

    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("atomically creates a text fragment, seedling plant, and created event", async () => {
    const result = await createLocalFragment(
      {
        title: "新的想法",
        rawText: "保留原始文字，不等待 AI。",
      },
      {
        database,
        createId: createIdSequence(["fragment-1", "plant-1", "event-1"]),
        now: () => TEST_DATE,
      },
    );

    expect(result.fragment).toEqual({
      id: "fragment-1",
      contentType: "text",
      title: "新的想法",
      rawText: "保留原始文字，不等待 AI。",
      sourceUrl: null,
      summary: null,
      keywords: [],
      lifecycleStatus: "active",
      completionStatus: "open",
      analysisStatus: "not_required",
      embedding: null,
      parentFragmentId: null,
      createdAt: TEST_TIMESTAMP,
      updatedAt: TEST_TIMESTAMP,
      lastInteractedAt: TEST_TIMESTAMP,
      completedAt: null,
    });
    expect(result.plant).toEqual({
      id: "plant-1",
      fragmentId: "fragment-1",
      speciesId: null,
      stage: "seedling",
      vitality: "active",
      growthScore: 0,
      slotId: "slot-01",
      createdAt: TEST_TIMESTAMP,
      updatedAt: TEST_TIMESTAMP,
    });
    expect(result.createdEvent).toEqual({
      id: "event-1",
      fragmentId: "fragment-1",
      type: "created",
      payload: null,
      occurredAt: TEST_TIMESTAMP,
      ruleVersion: 1,
    });

    await expect(database.fragments.toArray()).resolves.toEqual([result.fragment]);
    await expect(database.plants.toArray()).resolves.toEqual([result.plant]);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([result.createdEvent]);
  });

  it("uses the first free configured slot", async () => {
    await database.plants.bulkAdd([
      createOccupiedPlant("slot-01", 1),
      createOccupiedPlant("slot-02", 2),
    ]);

    const result = await createLocalFragment(
      { title: "第三株植物", rawText: "应该进入第三个槽位" },
      {
        database,
        createId: createIdSequence(["fragment-3", "plant-3", "event-3"]),
        now: () => TEST_DATE,
      },
    );

    expect(result.plant.slotId).toBe("slot-03");
  });

  it("serializes concurrent creations so plants receive different slots", async () => {
    const [firstResult, secondResult] = await Promise.all([
      createLocalFragment(
        { title: "并发碎片一", rawText: "第一条并发写入" },
        {
          database,
          createId: createIdSequence(["fragment-concurrent-1", "plant-concurrent-1", "event-1"]),
          now: () => TEST_DATE,
        },
      ),
      createLocalFragment(
        { title: "并发碎片二", rawText: "第二条并发写入" },
        {
          database,
          createId: createIdSequence(["fragment-concurrent-2", "plant-concurrent-2", "event-2"]),
          now: () => TEST_DATE,
        },
      ),
    ]);

    expect([firstResult.plant.slotId, secondResult.plant.slotId].sort()).toEqual([
      "slot-01",
      "slot-02",
    ]);
  });

  it("still creates all records with a null slotId when all 36 slots are occupied", async () => {
    await database.plants.bulkAdd(
      PLANT_SLOT_IDS.map((slotId, index) => createOccupiedPlant(slotId, index + 1)),
    );

    const result = await createLocalFragment(
      { title: "暂未放置", rawText: "花园已满，但内容仍需保存。" },
      {
        database,
        createId: createIdSequence([
          "fragment-without-slot",
          "plant-without-slot",
          "event-without-slot",
        ]),
        now: () => TEST_DATE,
      },
    );

    expect(result.plant.slotId).toBeNull();
    await expect(database.fragments.get(result.fragment.id)).resolves.toEqual(result.fragment);
    await expect(database.plants.get(result.plant.id)).resolves.toEqual(result.plant);
    await expect(database.fragmentEvents.get(result.createdEvent.id)).resolves.toEqual(
      result.createdEvent,
    );
  });

  it("rolls back the fragment when a later plant write fails", async () => {
    const existingPlant = createOccupiedPlant("slot-01", 1);
    existingPlant.id = "plant-id-collision";
    await database.plants.add(existingPlant);

    await expect(
      createLocalFragment(
        { title: "应当回滚", rawText: "植物写入会发生主键冲突。" },
        {
          database,
          createId: createIdSequence([
            "fragment-that-must-rollback",
            existingPlant.id,
            "event-that-must-not-exist",
          ]),
          now: () => TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.toArray()).resolves.toEqual([existingPlant]);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("rolls back the fragment and plant when the final event write fails", async () => {
    const existingEvent: FragmentEvent = {
      id: "event-id-collision",
      fragmentId: "existing-fragment",
      type: "created",
      payload: null,
      occurredAt: TEST_TIMESTAMP,
      ruleVersion: 1,
    };
    await database.fragmentEvents.add(existingEvent);

    await expect(
      createLocalFragment(
        { title: "最终写入失败", rawText: "事件主键冲突时全部回滚。" },
        {
          database,
          createId: createIdSequence([
            "fragment-that-must-rollback",
            "plant-that-must-rollback",
            existingEvent.id,
          ]),
          now: () => TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
  });
});
