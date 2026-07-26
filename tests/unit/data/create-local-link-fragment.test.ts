import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLANT_SLOT_IDS, type Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import {
  createLocalLinkFragment,
  type CreateLocalLinkFragmentResult,
  type CreatedLocalLinkFragment,
} from "../../../services/create-local-link-fragment";
import { createIdSequence } from "./stage-two-fixtures";

const NOW = "2026-07-23T08:30:00.000Z";

let database: FragmentGardenDatabase;

function requireCreated(result: CreateLocalLinkFragmentResult): CreatedLocalLinkFragment {
  if (result.kind !== "created") {
    throw new Error("Expected a newly created link fragment");
  }

  return result;
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
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(
    `fragment-garden-create-link-fragment-${crypto.randomUUID()}`,
  );
  await database.open();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("createLocalLinkFragment", () => {
  it("atomically plants a link locally without making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "  https://EXAMPLE.com/article/?utm_source=newsletter&item=keep#section  ",
          initiatedBy: "form",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence([
            "link-fragment",
            "link-plant",
            "created-event",
            "external-import",
          ]),
        },
      ),
    );

    expect(result.fragment).toEqual({
      id: "link-fragment",
      contentType: "link",
      title: "来自 example.com 的链接",
      rawText: null,
      sourceUrl: "https://EXAMPLE.com/article/?utm_source=newsletter&item=keep#section",
      contentMarkdown:
        "来源链接：https://EXAMPLE.com/article/?utm\\_source=newsletter&item=keep\\#section",
      summary: null,
      keywords: [],
      lifecycleStatus: "active",
      completionStatus: "open",
      analysisStatus: "pending",
      embedding: null,
      parentFragmentId: null,
      createdAt: NOW,
      updatedAt: NOW,
      lastInteractedAt: NOW,
      completedAt: null,
    });
    expect(result.plant).toMatchObject({
      id: "link-plant",
      fragmentId: "link-fragment",
      stage: "seedling",
      vitality: "active",
      growthScore: 0,
      slotId: "slot-01",
    });
    expect(result.createdEvent).toMatchObject({
      id: "created-event",
      fragmentId: "link-fragment",
      type: "created",
      payload: null,
    });
    expect(result.externalLinkImport).toEqual({
      id: "external-import",
      fragmentId: "link-fragment",
      provider: "getnote",
      sourceUrl: "https://EXAMPLE.com/article/?utm_source=newsletter&item=keep#section",
      normalizedUrl: "https://example.com/article?item=keep",
      canonicalUrl: null,
      sourceContent: null,
      sourceContentTruncated: false,
      status: "pending",
      initiatedBy: "form",
      taskId: null,
      externalNoteId: null,
      providerRequestId: null,
      attemptCount: 0,
      attemptGeneration: 0,
      userProvidedTitle: false,
      userProvidedContent: false,
      errorCode: null,
      errorMessage: null,
      terminalNotificationStatus: null,
      createdAt: NOW,
      updatedAt: NOW,
      startedAt: null,
      lastPolledAt: null,
      completedAt: null,
    });
    await expect(database.fragments.toArray()).resolves.toEqual([result.fragment]);
    await expect(database.plants.toArray()).resolves.toEqual([result.plant]);
    await expect(database.fragmentEvents.toArray()).resolves.toEqual([result.createdEvent]);
    await expect(database.externalLinkImports.toArray()).resolves.toEqual([
      result.externalLinkImport,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a manual title and records the companion initiator", async () => {
    const result = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/article",
          title: "  用户自己的标题  ",
          initiatedBy: "companion",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence(["fragment", "plant", "event", "import"]),
        },
      ),
    );

    expect(result.fragment.title).toBe("用户自己的标题");
    expect(result.externalLinkImport).toMatchObject({
      initiatedBy: "companion",
      userProvidedTitle: true,
      userProvidedContent: false,
    });
  });

  it("rejects an unsafe URL before writing any local records", async () => {
    await expect(
      createLocalLinkFragment(
        {
          sourceUrl: "http://127.0.0.1/private",
          initiatedBy: "form",
          now: NOW,
        },
        { database },
      ),
    ).rejects.toBeDefined();

    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.externalLinkImports.count()).resolves.toBe(0);
  });

  it("still creates all records with a null slot when all garden slots are occupied", async () => {
    await database.plants.bulkAdd(
      PLANT_SLOT_IDS.map((slotId, index) => createOccupiedPlant(slotId, index)),
    );

    const result = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/full-garden",
          initiatedBy: "form",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence(["fragment", "plant", "event", "import"]),
        },
      ),
    );

    expect(result.plant.slotId).toBeNull();
    await expect(database.fragments.get(result.fragment.id)).resolves.toEqual(result.fragment);
    await expect(database.externalLinkImports.get(result.externalLinkImport.id)).resolves.toEqual(
      result.externalLinkImport,
    );
  });

  it("rolls back Fragment, Plant, and Event when the import write fails", async () => {
    database.externalLinkImports.hook("creating", () => {
      throw new Error("simulated import persistence failure");
    });

    await expect(
      createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/rollback",
          initiatedBy: "form",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence(["fragment", "plant", "event", "import"]),
        },
      ),
    ).rejects.toThrow("simulated import persistence failure");

    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.externalLinkImports.count()).resolves.toBe(0);
  });

  it("returns a duplicate result for equivalent URLs and only duplicates after confirmation", async () => {
    const first = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/article?utm_source=first&item=keep",
          initiatedBy: "form",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence([
            "first-fragment",
            "first-plant",
            "first-event",
            "first-import",
          ]),
        },
      ),
    );
    const duplicate = await createLocalLinkFragment(
      {
        sourceUrl: "https://EXAMPLE.com/article/?item=keep&utm_source=second#part",
        initiatedBy: "form",
        now: NOW,
      },
      {
        database,
        createId: () => {
          throw new Error("Duplicate detection must not consume an ID");
        },
      },
    );

    expect(duplicate).toMatchObject({
      kind: "duplicate",
      fragment: { id: first.fragment.id },
      externalLinkImport: { id: first.externalLinkImport.id },
    });
    await expect(database.fragments.count()).resolves.toBe(1);

    const confirmedCopy = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/article?item=keep",
          initiatedBy: "form",
          now: NOW,
          allowDuplicate: true,
        },
        {
          database,
          createId: createIdSequence(["copy-fragment", "copy-plant", "copy-event", "copy-import"]),
        },
      ),
    );

    expect(confirmedCopy.fragment.id).toBe("copy-fragment");
    expect(confirmedCopy.externalLinkImport.normalizedUrl).toBe(
      first.externalLinkImport.normalizedUrl,
    );
    await expect(database.fragments.count()).resolves.toBe(2);
    await expect(database.externalLinkImports.count()).resolves.toBe(2);
  });

  it("allows planting again when the previous matching fragment was deleted", async () => {
    const first = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/deleted",
          initiatedBy: "form",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence([
            "deleted-fragment",
            "deleted-plant",
            "deleted-event",
            "deleted-import",
          ]),
        },
      ),
    );
    await database.fragments.update(first.fragment.id, { lifecycleStatus: "deleted" });

    const second = requireCreated(
      await createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/deleted",
          initiatedBy: "form",
          now: NOW,
        },
        {
          database,
          createId: createIdSequence(["new-fragment", "new-plant", "new-event", "new-import"]),
        },
      ),
    );

    expect(second.fragment.id).toBe("new-fragment");
  });

  it("serializes concurrent duplicate checks so only one default creation succeeds", async () => {
    const results = await Promise.all([
      createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/concurrent?utm_source=one",
          initiatedBy: "form",
          now: NOW,
        },
        { database, createId: () => crypto.randomUUID() },
      ),
      createLocalLinkFragment(
        {
          sourceUrl: "https://example.com/concurrent?utm_source=two",
          initiatedBy: "companion",
          now: NOW,
        },
        { database, createId: () => crypto.randomUUID() },
      ),
    ]);

    expect(results.filter(({ kind }) => kind === "created")).toHaveLength(1);
    expect(results.filter(({ kind }) => kind === "duplicate")).toHaveLength(1);
    await expect(database.fragments.count()).resolves.toBe(1);
    await expect(database.plants.count()).resolves.toBe(1);
    await expect(database.fragmentEvents.count()).resolves.toBe(1);
    await expect(database.externalLinkImports.count()).resolves.toBe(1);
  });
});
