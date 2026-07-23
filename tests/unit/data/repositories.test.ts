import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Fragment, FragmentEvent, Plant, Settings } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { FragmentEventRepository } from "../../../data/repositories/fragment-event-repository";
import { FragmentRepository } from "../../../data/repositories/fragment-repository";
import { PlantRepository } from "../../../data/repositories/plant-repository";
import { SettingsRepository } from "../../../data/repositories/settings-repository";

const TEST_TIMESTAMP = "2026-07-23T00:00:00.000Z";

let database: FragmentGardenDatabase;

function createFragment(id: string): Fragment {
  return {
    id,
    contentType: "text",
    title: "仓库测试",
    rawText: "原始内容",
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
  };
}

function createPlant(id: string, fragmentId: string): Plant {
  return {
    id,
    fragmentId,
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId: "slot-01",
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
  };
}

function createEvent(id: string, fragmentId: string, occurredAt: string): FragmentEvent {
  return {
    id,
    fragmentId,
    type: "created",
    payload: null,
    occurredAt,
    ruleVersion: 1,
  };
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-repositories-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("FragmentRepository", () => {
  it("adds, gets, lists, and updates fragments", async () => {
    const repository = new FragmentRepository(database);
    const firstFragment = createFragment("fragment-1");
    const secondFragment = createFragment("fragment-2");

    await repository.add(firstFragment);
    await repository.add(secondFragment);

    await expect(repository.getById(firstFragment.id)).resolves.toEqual(firstFragment);
    await expect(repository.list()).resolves.toEqual([firstFragment, secondFragment]);
    await expect(repository.update(firstFragment.id, { title: "更新后的标题" })).resolves.toBe(1);
    await expect(repository.getById(firstFragment.id)).resolves.toMatchObject({
      id: firstFragment.id,
      title: "更新后的标题",
    });
  });
});

describe("PlantRepository", () => {
  it("adds, gets, lists, and updates plants", async () => {
    const repository = new PlantRepository(database);
    const firstPlant = createPlant("plant-1", "fragment-1");
    const secondPlant = createPlant("plant-2", "fragment-2");

    await repository.add(firstPlant);
    await repository.add(secondPlant);

    await expect(repository.getById(firstPlant.id)).resolves.toEqual(firstPlant);
    await expect(repository.getByFragmentId(secondPlant.fragmentId)).resolves.toEqual(secondPlant);
    await expect(repository.list()).resolves.toEqual([firstPlant, secondPlant]);
    await expect(
      repository.update(firstPlant.id, { stage: "growing", growthScore: 1 }),
    ).resolves.toBe(1);
    await expect(repository.getById(firstPlant.id)).resolves.toMatchObject({
      id: firstPlant.id,
      stage: "growing",
      growthScore: 1,
    });
  });
});

describe("FragmentEventRepository", () => {
  it("adds events and lists a fragment's events in occurrence order", async () => {
    const repository = new FragmentEventRepository(database);
    const laterEvent = createEvent("event-later", "fragment-1", "2026-07-23T01:00:00.000Z");
    const earlierEvent = createEvent("event-earlier", "fragment-1", "2026-07-23T00:00:00.000Z");
    const unrelatedEvent = createEvent("event-unrelated", "fragment-2", "2026-07-22T00:00:00.000Z");

    await repository.add(laterEvent);
    await repository.add(earlierEvent);
    await repository.add(unrelatedEvent);

    await expect(repository.listByFragmentId("fragment-1")).resolves.toEqual([
      earlierEvent,
      laterEvent,
    ]);
  });
});

describe("SettingsRepository", () => {
  it("gets and saves the local settings record", async () => {
    const repository = new SettingsRepository(database);
    const settings: Settings = {
      id: "local-user",
      onboardingCompleted: false,
      companionType: null,
      lastOpenedAt: null,
      lastRecommendationDate: null,
      schemaVersion: 1,
    };

    await expect(repository.get()).resolves.toBeUndefined();

    await repository.save(settings);
    await expect(repository.get()).resolves.toEqual(settings);

    const updatedSettings: Settings = {
      ...settings,
      onboardingCompleted: true,
      companionType: "cat",
    };
    await repository.save(updatedSettings);
    await expect(repository.get()).resolves.toEqual(updatedSettings);
  });
});
