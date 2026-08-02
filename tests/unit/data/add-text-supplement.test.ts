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
      { fragmentId: fragment.id, contentMarkdown: "  新的补充  " },
      {
        database,
        createId: createIdSequence(["fragment-note", "text-added-event", "restored-event"]),
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
    expect(result.note).toEqual({
      id: "fragment-note",
      fragmentId: fragment.id,
      contentMarkdown: "新的补充",
      source: "user",
      createdAt: STAGE_TWO_TEST_TIMESTAMP,
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
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
    await expect(database.fragmentNotes.get(result.note.id)).resolves.toEqual(result.note);
    await expect(database.fragmentNotes.count()).resolves.toBe(1);
  });

  it("scores every independently saved same-day supplement", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await addTextSupplement(
      { fragmentId: fragment.id, contentMarkdown: "上午补充" },
      {
        database,
        createId: createIdSequence(["same-day-note-1", "same-day-event-1"]),
        now: () => new Date("2026-07-24T08:00:00.000Z"),
      },
    );
    const secondResult = await addTextSupplement(
      { fragmentId: fragment.id, contentMarkdown: "下午补充" },
      {
        database,
        createId: createIdSequence(["same-day-note-2", "same-day-event-2"]),
        now: () => new Date("2026-07-24T16:00:00.000Z"),
      },
    );

    expect(secondResult.plant.growthScore).toBe(2);
    expect(secondResult.plant.stage).toBe("growing");
    await expect(database.fragmentEvents.where("type").equals("text_added").count()).resolves.toBe(
      2,
    );
    await expect(database.fragmentNotes.count()).resolves.toBe(2);
  });

  it("scores another text supplement on the next UTC date", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await addTextSupplement(
      { fragmentId: fragment.id, contentMarkdown: "第一天" },
      {
        database,
        createId: createIdSequence(["day-one-note", "day-one-event"]),
        now: () => new Date("2026-07-24T23:00:00.000Z"),
      },
    );
    const nextDayResult = await addTextSupplement(
      { fragmentId: fragment.id, contentMarkdown: "第二天" },
      {
        database,
        createId: createIdSequence(["day-two-note", "day-two-event"]),
        now: () => new Date("2026-07-25T00:01:00.000Z"),
      },
    );

    expect(nextDayResult.plant.growthScore).toBe(2);
    expect(nextDayResult.plant.stage).toBe("growing");
    await expect(database.fragmentNotes.count()).resolves.toBe(2);
  });

  it("rejects whitespace-only supplements without writing anything", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await expect(
      addTextSupplement(
        { fragmentId: fragment.id, contentMarkdown: " \n\t " },
        {
          database,
          createId: createIdSequence(["unused-note", "unused-event"]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.fragmentNotes.count()).resolves.toBe(0);
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
        { fragmentId: fragment.id, contentMarkdown: "应当整体回滚" },
        {
          database,
          createId: createIdSequence(["rollback-note", existingEvent.id, "restored-event"]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
    await expect(database.fragmentNotes.count()).resolves.toBe(0);
  });

  it("rolls back every related write when local storage is full", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    database.fragmentNotes.hook("creating", () => {
      throw new DOMException("storage full", "QuotaExceededError");
    });

    await expect(
      addTextSupplement(
        { fragmentId: fragment.id, contentMarkdown: "不会产生半条追加笔记" },
        {
          database,
          createId: createIdSequence(["quota-note", "quota-event"]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.fragmentNotes.count()).resolves.toBe(0);
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
      { fragmentId: fragment.id, contentMarkdown: "完成后的补充" },
      {
        database,
        createId: createIdSequence(["completed-note", "completed-text-event"]),
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
    await expect(database.fragmentNotes.get("completed-note")).resolves.toEqual(result.note);
  });

  it("allows an archived fragment to be supplemented without returning it to the garden", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "archived" });
    const plant = createStageTwoPlant({ slotId: null, vitality: "active" });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await addTextSupplement(
      { fragmentId: fragment.id, contentMarkdown: "封存后的补充" },
      {
        database,
        createId: createIdSequence(["archived-note", "archived-text-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment.lifecycleStatus).toBe("archived");
    expect(result.plant.slotId).toBeNull();
    expect(result.plant.growthScore).toBe(1);
    await expect(database.fragmentNotes.get("archived-note")).resolves.toEqual(result.note);
  });
});
