import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { addTextSupplement } from "../../../services/add-text-supplement";
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

beforeEach(async () => {
  database = createStageTwoDatabase("add-supplement");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("addTextSupplement", () => {
  it("stores a validated event, restores activity, and recalculates growth", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    const createdEvent = createStageTwoEvent("created");
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(createdEvent);

    const result = await addTextSupplement(
      { fragmentId: fragment.id, text: "  新的补充  " },
      {
        database,
        createId: createIdSequence(["text-added-event", "restored-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.textAddedEvent).toEqual({
      id: "text-added-event",
      fragmentId: fragment.id,
      type: "text_added",
      payload: { text: "新的补充" },
      occurredAt: STAGE_TWO_TEST_TIMESTAMP,
      ruleVersion: 1,
    });
    expect(result.fragment).toMatchObject({
      rawText: fragment.rawText,
      lifecycleStatus: "active",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.plant).toMatchObject({
      vitality: "active",
      growthScore: 1,
      stage: "growing",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.restoredEvent).toMatchObject({
      id: "restored-event",
      type: "restored",
      payload: { reason: "content_updated" },
    });
  });

  it("saves repeated same-day supplements but scores the event type once", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await addTextSupplement(
      { fragmentId: fragment.id, text: "上午补充" },
      {
        database,
        createId: createIdSequence(["same-day-event-1"]),
        now: () => new Date("2026-07-24T08:00:00.000Z"),
      },
    );
    const secondResult = await addTextSupplement(
      { fragmentId: fragment.id, text: "下午补充" },
      {
        database,
        createId: createIdSequence(["same-day-event-2"]),
        now: () => new Date("2026-07-24T16:00:00.000Z"),
      },
    );

    expect(secondResult.plant.growthScore).toBe(1);
    expect(secondResult.plant.stage).toBe("growing");
    await expect(database.fragmentEvents.where("type").equals("text_added").count()).resolves.toBe(
      2,
    );
  });

  it("scores another text supplement on the next UTC date", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await addTextSupplement(
      { fragmentId: fragment.id, text: "第一天" },
      {
        database,
        createId: createIdSequence(["day-one-event"]),
        now: () => new Date("2026-07-24T23:00:00.000Z"),
      },
    );
    const nextDayResult = await addTextSupplement(
      { fragmentId: fragment.id, text: "第二天" },
      {
        database,
        createId: createIdSequence(["day-two-event"]),
        now: () => new Date("2026-07-25T00:01:00.000Z"),
      },
    );

    expect(nextDayResult.plant.growthScore).toBe(2);
    expect(nextDayResult.plant.stage).toBe("growing");
  });

  it("rejects whitespace-only supplements without writing anything", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await expect(
      addTextSupplement(
        { fragmentId: fragment.id, text: " \n\t " },
        {
          database,
          createId: createIdSequence(["unused-event"]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });

  it("rolls back fragment and plant updates when the event write fails", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    const existingEvent = createStageTwoEvent("viewed", {
      id: "event-collision",
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(existingEvent);

    await expect(
      addTextSupplement(
        { fragmentId: fragment.id, text: "应当整体回滚" },
        {
          database,
          createId: createIdSequence([existingEvent.id, "restored-event"]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
  });

  it("keeps completed content permanently blooming after another supplement", async () => {
    const fragment = createStageTwoFragment({
      completionStatus: "completed",
      completedAt: "2026-07-23T09:00:00.000Z",
    });
    const plant = createStageTwoPlant({
      stage: "permanent_bloom",
      growthScore: 1,
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.bulkAdd([
      createStageTwoEvent("completed", {
        id: "completed-event",
        payload: { outcome: null },
      }),
      createStageTwoEvent("text_added", {
        id: "previous-text",
        payload: { text: "前一天的补充" },
        occurredAt: "2026-07-23T08:00:00.000Z",
      }),
    ]);

    const result = await addTextSupplement(
      { fragmentId: fragment.id, text: "完成后的补充" },
      {
        database,
        createId: createIdSequence(["completed-text-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment.completionStatus).toBe("completed");
    expect(result.plant.stage).toBe("permanent_bloom");
    expect(result.plant.growthScore).toBe(2);
    expect(result.restoredEvent).toBeNull();
    await expect(database.fragmentEvents.where("type").equals("completed").count()).resolves.toBe(
      1,
    );
  });

  it("allows an archived fragment to be supplemented without returning it to the garden", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "archived" });
    const plant = createStageTwoPlant({ slotId: null, vitality: "active" });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await addTextSupplement(
      { fragmentId: fragment.id, text: "封存后的补充" },
      {
        database,
        createId: createIdSequence(["archived-text-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment.lifecycleStatus).toBe("archived");
    expect(result.plant.slotId).toBeNull();
    expect(result.plant.growthScore).toBe(1);
  });
});
