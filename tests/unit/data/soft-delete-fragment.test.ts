import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { listFragmentCardViewModels } from "../../../data/queries/fragment-card-query";
import { createLocalLinkFragment } from "../../../services/create-local-link-fragment";
import { softDeleteFragment } from "../../../services/soft-delete-fragment";
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
  database = createStageTwoDatabase("soft-delete");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("softDeleteFragment", () => {
  it("marks the fragment deleted, records history, and releases its plant slot", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant({
      stage: "growing",
      growthScore: 2,
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await softDeleteFragment(
      { fragmentId: fragment.id },
      {
        database,
        createId: createIdSequence(["deleted-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment).toMatchObject({
      lifecycleStatus: "deleted",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.deletedEvent).toEqual({
      id: "deleted-event",
      fragmentId: fragment.id,
      type: "deleted",
      payload: null,
      occurredAt: STAGE_TWO_TEST_TIMESTAMP,
      ruleVersion: 1,
    });
    await expect(database.plants.get(plant.id)).resolves.toEqual({
      ...plant,
      slotId: null,
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    await expect(listFragmentCardViewModels(database)).resolves.toEqual([]);
  });

  it("records no-longer-needed only after the final delete choice", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await softDeleteFragment(
      {
        fragmentId: fragment.id,
        reviewDecision: "no_longer_needed",
      },
      {
        database,
        createId: createIdSequence(["deleted-event", "reviewed-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.reviewedEvent).toMatchObject({
      type: "reviewed",
      payload: { decision: "no_longer_needed" },
    });
    await expect(database.fragmentEvents.count()).resolves.toBe(2);
  });

  it("updates the plant timestamp when deleting an already-unplaced fragment", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant({ slotId: null });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await softDeleteFragment(
      { fragmentId: fragment.id },
      {
        database,
        createId: createIdSequence(["deleted-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.plant).toEqual({
      ...plant,
      slotId: null,
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    await expect(database.plants.get(plant.id)).resolves.toEqual(result.plant);
  });

  it("atomically stops an unfinished link import without creating a companion notification", async () => {
    const created = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/delete-before-import",
        initiatedBy: "companion",
        now: STAGE_TWO_TEST_TIMESTAMP,
      },
      {
        database,
        createId: createIdSequence([
          "link-fragment",
          "link-plant",
          "link-created-event",
          "link-import",
        ]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );
    if (created.kind !== "created") {
      throw new Error("Expected a new link fragment");
    }

    await softDeleteFragment(
      { fragmentId: created.fragment.id },
      {
        database,
        createId: createIdSequence(["link-deleted-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    await expect(
      database.externalLinkImports.get(created.externalLinkImport.id),
    ).resolves.toMatchObject({
      status: "failed",
      errorCode: "fragment_deleted",
      errorMessage: "链接碎片已删除，读取任务已经停止。",
      terminalNotificationStatus: null,
    });
    await expect(database.chatMessages.count()).resolves.toBe(0);
  });

  it("rolls back link-import cancellation when the delete event cannot be saved", async () => {
    const created = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/delete-rollback",
        initiatedBy: "form",
        now: STAGE_TWO_TEST_TIMESTAMP,
      },
      {
        database,
        createId: createIdSequence([
          "rollback-link-fragment",
          "rollback-link-plant",
          "rollback-link-created-event",
          "rollback-link-import",
        ]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );
    if (created.kind !== "created") {
      throw new Error("Expected a new link fragment");
    }
    const collidingEvent = createStageTwoEvent("viewed", {
      id: "link-delete-event-collision",
      fragmentId: created.fragment.id,
    });
    await database.fragmentEvents.add(collidingEvent);

    await expect(
      softDeleteFragment(
        { fragmentId: created.fragment.id },
        {
          database,
          createId: createIdSequence([collidingEvent.id]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(created.fragment.id)).resolves.toEqual(created.fragment);
    await expect(database.plants.get(created.plant.id)).resolves.toEqual(created.plant);
    await expect(database.externalLinkImports.get(created.externalLinkImport.id)).resolves.toEqual(
      created.externalLinkImport,
    );
  });

  it("rolls back the fragment update when the deleted event write fails", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    const existingEvent = createStageTwoEvent("viewed", {
      id: "event-collision",
    });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(existingEvent);

    await expect(
      softDeleteFragment(
        { fragmentId: fragment.id },
        {
          database,
          createId: createIdSequence([existingEvent.id]),
          now: () => STAGE_TWO_TEST_DATE,
        },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([existingEvent]);
  });
});
