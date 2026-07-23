import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { reviewFragment } from "../../../services/review-fragment";
import {
  createStageTwoDatabase,
  createStageTwoFragment,
  createStageTwoPlant,
} from "./stage-two-fixtures";

const NOW = "2026-07-26T08:30:00.000Z";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("stage-five-review");
  await database.open();
});

afterEach(async () => {
  vi.restoreAllMocks();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

async function seedReviewTarget(
  fragmentOverrides: Parameters<typeof createStageTwoFragment>[0] = {},
  plantOverrides: Parameters<typeof createStageTwoPlant>[0] = {},
): Promise<void> {
  await database.fragments.add(createStageTwoFragment(fragmentOverrides));
  await database.plants.add(createStageTwoPlant(plantOverrides));
}

describe("reviewFragment", () => {
  it("restores a dormant fragment without changing growth", async () => {
    await seedReviewTarget(
      { lifecycleStatus: "dormant" },
      { vitality: "dormant", stage: "budding", growthScore: 4 },
    );

    const result = await reviewFragment(
      {
        fragmentId: "fragment-1",
        decision: "still_interested",
        now: NOW,
      },
      { database, createId: () => crypto.randomUUID() },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "active",
      lastInteractedAt: NOW,
    });
    expect(result.plant).toMatchObject({
      vitality: "active",
      stage: "budding",
      growthScore: 4,
    });
    expect(result.reviewedEvent.payload).toEqual({ decision: "still_interested" });
    expect(result.lifecycleEvent).toMatchObject({
      type: "restored",
      payload: { reason: "reviewed" },
    });
  });

  it("puts an active fragment to sleep immediately and only writes dormant once", async () => {
    await seedReviewTarget();

    const first = await reviewFragment(
      { fragmentId: "fragment-1", decision: "not_now", now: NOW },
      { database, createId: () => crypto.randomUUID() },
    );
    const second = await reviewFragment(
      {
        fragmentId: "fragment-1",
        decision: "not_now",
        now: "2026-07-26T09:00:00.000Z",
      },
      { database, createId: () => crypto.randomUUID() },
    );

    expect(first.fragment.lifecycleStatus).toBe("dormant");
    expect(first.plant.vitality).toBe("dormant");
    expect(first.lifecycleEvent?.type).toBe("dormant");
    expect(second.lifecycleEvent).toBeNull();
    await expect(database.fragmentEvents.where("type").equals("reviewed").count()).resolves.toBe(2);
    await expect(database.fragmentEvents.where("type").equals("dormant").count()).resolves.toBe(1);
  });

  it("rejects not-now for completed content without writing an event", async () => {
    await seedReviewTarget(
      {
        completionStatus: "completed",
        completedAt: "2026-07-25T08:30:00.000Z",
      },
      { stage: "permanent_bloom" },
    );

    await expect(
      reviewFragment(
        { fragmentId: "fragment-1", decision: "not_now", now: NOW },
        { database, createId: () => crypto.randomUUID() },
      ),
    ).rejects.toThrow("cannot be marked not now");

    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.fragments.get("fragment-1")).resolves.toMatchObject({
      lifecycleStatus: "active",
      completionStatus: "completed",
    });
  });

  it("rejects not-now for archived content before writing anything", async () => {
    await seedReviewTarget({ lifecycleStatus: "archived" }, { slotId: null, vitality: "active" });

    await expect(
      reviewFragment(
        { fragmentId: "fragment-1", decision: "not_now", now: NOW },
        { database, createId: () => crypto.randomUUID() },
      ),
    ).rejects.toThrow("Archived fragment fragment-1 cannot be marked not now");

    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.fragments.get("fragment-1")).resolves.toMatchObject({
      lifecycleStatus: "archived",
      lastInteractedAt: "2026-07-23T08:30:00.000Z",
    });
    await expect(database.plants.get("plant-1")).resolves.toMatchObject({
      slotId: null,
      vitality: "active",
      updatedAt: "2026-07-23T08:30:00.000Z",
    });
  });

  it.each(["fragment", "plant", "event"] as const)(
    "rolls back review when the %s write fails",
    async (failurePoint) => {
      const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
      const plant = createStageTwoPlant({
        vitality: "dormant",
        stage: "budding",
        growthScore: 4,
      });
      await database.fragments.add(fragment);
      await database.plants.add(plant);

      const error = new Error(`simulated ${failurePoint} failure`);
      if (failurePoint === "fragment") {
        vi.spyOn(database.fragments, "update").mockRejectedValueOnce(error);
      } else if (failurePoint === "plant") {
        vi.spyOn(database.plants, "update").mockRejectedValueOnce(error);
      } else {
        vi.spyOn(database.fragmentEvents, "add").mockRejectedValueOnce(error);
      }

      await expect(
        reviewFragment(
          {
            fragmentId: fragment.id,
            decision: "still_interested",
            now: NOW,
          },
          { database, createId: () => crypto.randomUUID() },
        ),
      ).rejects.toThrow(error.message);

      await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
      await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
      await expect(database.fragmentEvents.count()).resolves.toBe(0);
    },
  );
});
