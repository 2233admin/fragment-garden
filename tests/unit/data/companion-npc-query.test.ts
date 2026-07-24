import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { queryDormantFragmentList } from "../../../data/queries/companion-npc-query";
import { createStageTwoDatabase, createStageTwoFragment } from "./stage-two-fixtures";

let database: ReturnType<typeof createStageTwoDatabase>;

beforeEach(async () => {
  database = createStageTwoDatabase("stage-eight-npc-query");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("queryDormantFragmentList", () => {
  it("sorts dormant content deterministically, limits the visible list, and excludes other states", async () => {
    const dormantFragments = Array.from({ length: 6 }, (_, index) =>
      createStageTwoFragment({
        id: `dormant-${index}`,
        title: `休眠内容 ${index}`,
        lifecycleStatus: "dormant",
        lastInteractedAt: `2026-07-${String(10 + index).padStart(2, "0")}T08:30:00.000Z`,
      }),
    );

    await database.fragments.bulkAdd([
      ...dormantFragments,
      createStageTwoFragment({ id: "active", lifecycleStatus: "active" }),
      createStageTwoFragment({ id: "archived", lifecycleStatus: "archived" }),
      createStageTwoFragment({ id: "deleted", lifecycleStatus: "deleted" }),
    ]);

    await expect(queryDormantFragmentList(database)).resolves.toEqual({
      items: dormantFragments.slice(0, 5).map((fragment) => ({
        id: fragment.id,
        title: fragment.title,
        createdAt: fragment.createdAt,
        lastInteractedAt: fragment.lastInteractedAt,
      })),
      remainingCount: 1,
    });
  });

  it("uses id as a stable tie breaker", async () => {
    await database.fragments.bulkAdd([
      createStageTwoFragment({
        id: "dormant-b",
        lifecycleStatus: "dormant",
        lastInteractedAt: "2026-07-20T08:30:00.000Z",
      }),
      createStageTwoFragment({
        id: "dormant-a",
        lifecycleStatus: "dormant",
        lastInteractedAt: "2026-07-20T08:30:00.000Z",
      }),
    ]);

    await expect(queryDormantFragmentList(database)).resolves.toMatchObject({
      items: [{ id: "dormant-a" }, { id: "dormant-b" }],
    });
  });
});
