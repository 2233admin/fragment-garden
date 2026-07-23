import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import type { Fragment, Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { FRAGMENT_GARDEN_DATABASE_VERSION, FRAGMENT_GARDEN_SCHEMA_V1 } from "../../../data/schema";

const databaseInstances: FragmentGardenDatabase[] = [];

function createTestDatabase(name = `fragment-garden-database-${crypto.randomUUID()}`) {
  const database = new FragmentGardenDatabase(name);
  databaseInstances.push(database);
  return database;
}

function createFragment(id: string): Fragment {
  return {
    id,
    contentType: "text",
    title: "测试碎片",
    rawText: "一段本地保存的文字",
    sourceUrl: null,
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    lastInteractedAt: "2026-07-23T00:00:00.000Z",
    completedAt: null,
  };
}

function createPlant(id: string, fragmentId: string, slotId: string | null): Plant {
  return {
    id,
    fragmentId,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

afterEach(async () => {
  const databaseNames = new Set(databaseInstances.map((database) => database.name));

  for (const database of databaseInstances) {
    database.close();
  }

  for (const databaseName of databaseNames) {
    await Dexie.delete(databaseName);
  }

  databaseInstances.length = 0;
});

describe("FragmentGardenDatabase", () => {
  it("opens the current schema with all tables and required indexes", async () => {
    const database = createTestDatabase();

    await database.open();

    expect(database.verno).toBe(FRAGMENT_GARDEN_DATABASE_VERSION);
    expect(database.tables.map((table) => table.name).sort()).toEqual(
      [
        "attachments",
        "chatMessages",
        "clusters",
        "fragmentEvents",
        "fragments",
        "plants",
        "recommendations",
        "relations",
        "settings",
      ].sort(),
    );

    expect(database.fragments.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "lifecycleStatus",
        "completionStatus",
        "contentType",
        "createdAt",
        "lastInteractedAt",
      ]),
    );
    expect(database.attachments.schema.indexes.map((index) => index.name)).toContain("fragmentId");
    expect(database.fragmentEvents.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["fragmentId", "type", "occurredAt"]),
    );
    expect(database.plants.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["fragmentId", "slotId", "stage", "vitality"]),
    );
    expect(database.relations.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["sourceFragmentId", "targetFragmentId", "status"]),
    );
    expect(database.recommendations.schema.indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining(["fragmentId", "shownAt"]),
    );
    expect(database.chatMessages.schema.indexes.map((index) => index.name)).toContain("createdAt");
  });

  it("upgrades V1 data without loss and releases retired fragment slots", async () => {
    const databaseName = `fragment-garden-v1-upgrade-${crypto.randomUUID()}`;
    const legacyDatabase = new Dexie(databaseName);
    legacyDatabase.version(1).stores(FRAGMENT_GARDEN_SCHEMA_V1);
    await legacyDatabase.open();

    const activeFragment = createFragment("active-fragment");
    const archivedFragment = createFragment("archived-fragment");
    archivedFragment.lifecycleStatus = "archived";
    const deletedFragment = createFragment("deleted-fragment");
    deletedFragment.lifecycleStatus = "deleted";
    await legacyDatabase
      .table<Fragment>("fragments")
      .bulkAdd([activeFragment, archivedFragment, deletedFragment]);
    await legacyDatabase
      .table<Plant>("plants")
      .bulkAdd([
        createPlant("active-plant", activeFragment.id, "slot-01"),
        createPlant("archived-plant", archivedFragment.id, "slot-02"),
        createPlant("deleted-plant", deletedFragment.id, "slot-03"),
      ]);
    legacyDatabase.close();

    const upgradedDatabase = createTestDatabase(databaseName);
    await upgradedDatabase.open();

    expect(upgradedDatabase.verno).toBe(FRAGMENT_GARDEN_DATABASE_VERSION);
    await expect(upgradedDatabase.fragments.count()).resolves.toBe(3);
    await expect(upgradedDatabase.plants.get("active-plant")).resolves.toMatchObject({
      slotId: "slot-01",
    });
    await expect(upgradedDatabase.plants.get("archived-plant")).resolves.toMatchObject({
      slotId: null,
    });
    await expect(upgradedDatabase.plants.get("deleted-plant")).resolves.toMatchObject({
      slotId: null,
    });
  });

  it("persists data after close and reopening the same database name", async () => {
    const databaseName = `fragment-garden-reopen-${crypto.randomUUID()}`;
    const firstConnection = createTestDatabase(databaseName);
    const fragment = createFragment("fragment-persisted");

    await firstConnection.fragments.add(fragment);
    firstConnection.close();

    const reopenedConnection = createTestDatabase(databaseName);
    await reopenedConnection.open();

    await expect(reopenedConnection.fragments.get(fragment.id)).resolves.toEqual(fragment);
  });

  it("stores a plant with a null slotId", async () => {
    const database = createTestDatabase();
    const plant = createPlant("plant-without-slot", "fragment-without-slot", null);

    await database.plants.add(plant);

    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });

  it("keeps independently named test databases isolated", async () => {
    const firstDatabase = createTestDatabase();
    const secondDatabase = createTestDatabase();

    await firstDatabase.fragments.add(createFragment("fragment-only-in-first"));

    await expect(firstDatabase.fragments.count()).resolves.toBe(1);
    await expect(secondDatabase.fragments.count()).resolves.toBe(0);
  });

  it("deletes test data after the database is closed", async () => {
    const database = createTestDatabase();
    const databaseName = database.name;

    await database.fragments.add(createFragment("fragment-to-delete"));
    database.close();
    await Dexie.delete(databaseName);

    await expect(Dexie.exists(databaseName)).resolves.toBe(false);
  });
});
