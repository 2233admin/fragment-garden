import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { applyDormancyTransitions } from "../../../services/apply-dormancy-transitions";
import { archiveFragment } from "../../../services/archive-fragment";
import { completeFragment } from "../../../services/complete-fragment";
import { restoreArchivedFragment } from "../../../services/restore-archived-fragment";
import {
  createStageTwoDatabase,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

const NOW = "2026-07-26T08:30:00.000Z";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("stage-five-lifecycle");
  await database.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

async function addFragmentAndPlant(
  fragmentId: string,
  fragmentOverrides: Parameters<typeof createStageTwoFragment>[0] = {},
  plantOverrides: Parameters<typeof createStageTwoPlant>[0] = {},
): Promise<void> {
  await database.fragments.add(
    createStageTwoFragment({
      id: fragmentId,
      ...fragmentOverrides,
    }),
  );
  await database.plants.add(
    createStageTwoPlant({
      id: `plant-${fragmentId}`,
      fragmentId,
      ...plantOverrides,
    }),
  );
}

describe("applyDormancyTransitions", () => {
  it("persists all eligible 72-hour transitions and remains idempotent", async () => {
    await addFragmentAndPlant("eligible", {
      lastInteractedAt: "2026-07-23T08:30:00.000Z",
    });
    await addFragmentAndPlant("eligible-second", {
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
    });
    await addFragmentAndPlant("recent", {
      lastInteractedAt: "2026-07-23T08:30:00.001Z",
    });
    await addFragmentAndPlant("completed", {
      completionStatus: "completed",
      completedAt: "2026-07-24T08:30:00.000Z",
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
    });
    await addFragmentAndPlant(
      "archived",
      {
        lifecycleStatus: "archived",
        lastInteractedAt: "2026-07-20T08:30:00.000Z",
      },
      { slotId: null },
    );
    await addFragmentAndPlant(
      "deleted",
      {
        lifecycleStatus: "deleted",
        lastInteractedAt: "2026-07-20T08:30:00.000Z",
      },
      { slotId: null },
    );

    const firstResult = await applyDormancyTransitions(
      { now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );
    const secondResult = await applyDormancyTransitions(
      { now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );

    expect(new Set(firstResult.transitions.map(({ fragment }) => fragment.id))).toEqual(
      new Set(["eligible", "eligible-second"]),
    );
    expect(secondResult.transitions).toEqual([]);
    await expect(database.fragments.get("eligible")).resolves.toMatchObject({
      lifecycleStatus: "dormant",
      lastInteractedAt: "2026-07-23T08:30:00.000Z",
      updatedAt: NOW,
    });
    await expect(database.plants.get("plant-eligible")).resolves.toMatchObject({
      vitality: "dormant",
      updatedAt: NOW,
    });
    await expect(database.fragments.get("eligible-second")).resolves.toMatchObject({
      lifecycleStatus: "dormant",
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
      updatedAt: NOW,
    });
    await expect(database.plants.get("plant-eligible-second")).resolves.toMatchObject({
      vitality: "dormant",
      updatedAt: NOW,
    });
    await expect(database.fragmentEvents.where("type").equals("dormant").count()).resolves.toBe(2);
    await expect(database.fragments.get("recent")).resolves.toMatchObject({
      lifecycleStatus: "active",
    });
    await expect(database.fragments.get("completed")).resolves.toMatchObject({
      lifecycleStatus: "active",
    });
    await expect(database.fragments.get("deleted")).resolves.toMatchObject({
      lifecycleStatus: "deleted",
      updatedAt: "2026-07-23T08:30:00.000Z",
    });
    await expect(database.plants.get("plant-deleted")).resolves.toMatchObject({
      vitality: "active",
      updatedAt: "2026-07-23T08:30:00.000Z",
    });
  });

  it("rolls back all state when an event write fails", async () => {
    await addFragmentAndPlant("rollback", {
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
    });
    vi.spyOn(database.fragmentEvents, "add").mockRejectedValueOnce(
      new Error("simulated event failure"),
    );

    await expect(
      applyDormancyTransitions({ now: NOW }, { database, createId: () => "dormant-event" }),
    ).rejects.toThrow("simulated event failure");

    await expect(database.fragments.get("rollback")).resolves.toMatchObject({
      lifecycleStatus: "active",
    });
    await expect(database.plants.get("plant-rollback")).resolves.toMatchObject({
      vitality: "active",
    });
  });

  it("rolls back the entire batch when the second event write fails", async () => {
    await addFragmentAndPlant("rollback-first", {
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
    });
    await addFragmentAndPlant("rollback-second", {
      lastInteractedAt: "2026-07-20T08:30:00.000Z",
    });
    let createdEventCount = 0;
    database.fragmentEvents.hook("creating", () => {
      createdEventCount += 1;
      if (createdEventCount === 2) {
        throw new Error("simulated second event failure");
      }
    });

    await expect(
      applyDormancyTransitions({ now: NOW }, { database, createId: () => crypto.randomUUID() }),
    ).rejects.toThrow("simulated second event failure");

    await expect(database.fragments.get("rollback-first")).resolves.toMatchObject({
      lifecycleStatus: "active",
    });
    await expect(database.plants.get("plant-rollback-first")).resolves.toMatchObject({
      vitality: "active",
    });
    await expect(database.fragments.get("rollback-second")).resolves.toMatchObject({
      lifecycleStatus: "active",
    });
    await expect(database.plants.get("plant-rollback-second")).resolves.toMatchObject({
      vitality: "active",
    });
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
  });
});

describe("archiveFragment and restoreArchivedFragment", () => {
  it("archives once, records the previous slot, and restores into the first free slot", async () => {
    await addFragmentAndPlant("fragment", {}, { slotId: "slot-01" });

    const archived = await archiveFragment(
      {
        fragmentId: "fragment",
        now: NOW,
        reviewDecision: "no_longer_needed",
      },
      { database, createId: () => crypto.randomUUID() },
    );
    const repeated = await archiveFragment(
      { fragmentId: "fragment", now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );

    expect(archived.fragment.lifecycleStatus).toBe("archived");
    expect(archived.plant).toMatchObject({ slotId: null, vitality: "active" });
    expect(archived.archivedEvent?.payload).toEqual({ previousSlotId: "slot-01" });
    expect(archived.reviewedEvent?.payload).toEqual({ decision: "no_longer_needed" });
    expect(repeated.archivedEvent).toBeNull();
    await expect(
      database.fragmentEvents.where("fragmentId").equals("fragment").count(),
    ).resolves.toBe(2);

    await addFragmentAndPlant("occupant", {}, { slotId: "slot-01" });
    const restored = await restoreArchivedFragment(
      { fragmentId: "fragment", now: "2026-07-26T09:00:00.000Z" },
      { database, createId: () => "restore-event" },
    );

    expect(restored.fragment.lifecycleStatus).toBe("active");
    expect(restored.plant).toMatchObject({ slotId: "slot-02", vitality: "active" });
    expect(restored.restoredEvent?.payload).toEqual({ reason: "manual_restore" });
  });

  it("restores content even when all garden slots are occupied", async () => {
    await addFragmentAndPlant("archived", { lifecycleStatus: "archived" }, { slotId: null });
    const occupiedPlants = Array.from({ length: 36 }, (_, index) =>
      createStageTwoPlant({
        id: `occupied-plant-${index + 1}`,
        fragmentId: `occupied-fragment-${index + 1}`,
        slotId: `slot-${String(index + 1).padStart(2, "0")}`,
      }),
    );
    await database.plants.bulkAdd(occupiedPlants);

    const result = await restoreArchivedFragment(
      { fragmentId: "archived", now: NOW },
      { database, createId: () => "restore-event" },
    );

    expect(result.fragment.lifecycleStatus).toBe("active");
    expect(result.plant.slotId).toBeNull();
  });

  it("serializes concurrent restores so plants receive different slots", async () => {
    await addFragmentAndPlant("archived-a", { lifecycleStatus: "archived" }, { slotId: null });
    await addFragmentAndPlant("archived-b", { lifecycleStatus: "archived" }, { slotId: null });

    const [first, second] = await Promise.all([
      restoreArchivedFragment(
        { fragmentId: "archived-a", now: NOW },
        { database, createId: () => "restore-a" },
      ),
      restoreArchivedFragment(
        { fragmentId: "archived-b", now: NOW },
        { database, createId: () => "restore-b" },
      ),
    ]);

    expect(new Set([first.plant.slotId, second.plant.slotId])).toEqual(
      new Set(["slot-01", "slot-02"]),
    );
  });

  it("rolls back a restore when its event cannot be written", async () => {
    await addFragmentAndPlant("archived", { lifecycleStatus: "archived" }, { slotId: null });
    vi.spyOn(database.fragmentEvents, "add").mockRejectedValueOnce(
      new Error("simulated restore event failure"),
    );

    await expect(
      restoreArchivedFragment(
        { fragmentId: "archived", now: NOW },
        { database, createId: () => "restore-event" },
      ),
    ).rejects.toThrow("simulated restore event failure");

    await expect(database.fragments.get("archived")).resolves.toMatchObject({
      lifecycleStatus: "archived",
    });
    await expect(database.plants.get("plant-archived")).resolves.toMatchObject({
      slotId: null,
    });
  });
});

describe("completeFragment", () => {
  it("stores a normalized outcome, permanently blooms, and does not duplicate completion", async () => {
    await addFragmentAndPlant("fragment");

    const completed = await completeFragment(
      { fragmentId: "fragment", outcome: "  做成了一个小原型  ", now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );
    const repeated = await completeFragment(
      { fragmentId: "fragment", outcome: "另一个结果", now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );

    expect(completed.fragment).toMatchObject({
      completionStatus: "completed",
      completedAt: NOW,
      lifecycleStatus: "active",
    });
    expect(completed.completedEvent?.payload).toEqual({ outcome: "做成了一个小原型" });
    expect(completed.plant).toMatchObject({
      stage: "permanent_bloom",
      vitality: "active",
    });
    expect(repeated.completedEvent).toBeNull();
    await expect(database.fragmentEvents.where("type").equals("completed").count()).resolves.toBe(
      1,
    );
  });

  it("keeps an archived fragment archived and out of the garden when completed", async () => {
    await addFragmentAndPlant(
      "archived",
      { lifecycleStatus: "archived" },
      { slotId: null, vitality: "dormant" },
    );

    const result = await completeFragment(
      { fragmentId: "archived", outcome: null, now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "archived",
      completionStatus: "completed",
    });
    expect(result.plant).toMatchObject({
      slotId: null,
      vitality: "active",
      stage: "permanent_bloom",
    });
  });

  it("rolls back completion when its event cannot be written", async () => {
    await addFragmentAndPlant("rollback");
    vi.spyOn(database.fragmentEvents, "add").mockRejectedValueOnce(
      new Error("simulated completion event failure"),
    );

    await expect(
      completeFragment(
        { fragmentId: "rollback", outcome: null, now: NOW },
        { database, createId: () => "completed-event" },
      ),
    ).rejects.toThrow("simulated completion event failure");

    await expect(database.fragments.get("rollback")).resolves.toMatchObject({
      completionStatus: "open",
      completedAt: null,
    });
    await expect(database.plants.get("plant-rollback")).resolves.toMatchObject({
      stage: "seedling",
    });
  });
});
