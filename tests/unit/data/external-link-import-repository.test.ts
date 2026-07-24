import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ExternalLinkImport } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { findExistingExternalLinkImport } from "../../../data/queries/external-link-import-query";
import { ExternalLinkImportRepository } from "../../../data/repositories/external-link-import-repository";
import { createStageTwoFragment } from "./stage-two-fixtures";

const NORMALIZED_URL = "https://example.com/article";
const TEST_TIMESTAMP = "2026-07-23T08:30:00.000Z";

let database: FragmentGardenDatabase;

function createExternalLinkImport(overrides: Partial<ExternalLinkImport> = {}): ExternalLinkImport {
  return {
    id: "external-import-1",
    fragmentId: "fragment-1",
    provider: "getnote",
    sourceUrl: NORMALIZED_URL,
    normalizedUrl: NORMALIZED_URL,
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
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    startedAt: null,
    lastPolledAt: null,
    completedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  database = new FragmentGardenDatabase(
    `fragment-garden-external-import-repository-${crypto.randomUUID()}`,
  );
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("ExternalLinkImportRepository", () => {
  it("adds, gets, updates, and lists imports by status", async () => {
    const repository = new ExternalLinkImportRepository(database);
    const pendingImport = createExternalLinkImport();
    const completedImport = createExternalLinkImport({
      id: "external-import-2",
      fragmentId: "fragment-2",
      status: "completed",
      createdAt: "2026-07-23T09:30:00.000Z",
    });

    await repository.add(pendingImport);
    await repository.add(completedImport);
    await repository.update(pendingImport.id, {
      status: "processing",
      taskId: "task-1",
      attemptCount: 1,
    });

    await expect(repository.getByFragmentId(pendingImport.fragmentId)).resolves.toMatchObject({
      id: pendingImport.id,
      status: "processing",
      taskId: "task-1",
      attemptCount: 1,
    });
    await expect(repository.listByStatuses(["processing", "failed"])).resolves.toHaveLength(1);
  });

  it("enforces one import per fragment while allowing duplicate normalized URLs", async () => {
    const repository = new ExternalLinkImportRepository(database);
    await repository.add(createExternalLinkImport());

    await expect(
      repository.add(
        createExternalLinkImport({
          id: "same-fragment-second-import",
          sourceUrl: "https://example.com/article?copy=1",
          normalizedUrl: "https://example.com/article?copy=1",
        }),
      ),
    ).rejects.toBeDefined();

    await expect(
      repository.add(
        createExternalLinkImport({
          id: "same-normalized-url-second-fragment",
          fragmentId: "fragment-2",
        }),
      ),
    ).resolves.toBe("same-normalized-url-second-fragment");
    await expect(repository.listByNormalizedUrl(NORMALIZED_URL)).resolves.toHaveLength(2);
  });

  it("normalizes source content missing from an older V3 record to null", async () => {
    const repository = new ExternalLinkImportRepository(database);
    const legacyRecord = createExternalLinkImport();
    delete legacyRecord.sourceContent;
    await database.externalLinkImports.add(legacyRecord);

    await expect(repository.getById(legacyRecord.id)).resolves.toMatchObject({
      id: legacyRecord.id,
      sourceContent: null,
    });
  });
});

describe("findExistingExternalLinkImport", () => {
  it("ignores deleted fragments but still treats archived fragments as existing", async () => {
    const deletedFragment = createStageTwoFragment({
      id: "deleted-fragment",
      lifecycleStatus: "deleted",
    });
    const archivedFragment = createStageTwoFragment({
      id: "archived-fragment",
      lifecycleStatus: "archived",
    });
    await database.fragments.bulkAdd([deletedFragment, archivedFragment]);
    await database.externalLinkImports.bulkAdd([
      createExternalLinkImport({
        id: "deleted-import",
        fragmentId: deletedFragment.id,
        createdAt: "2026-07-22T08:30:00.000Z",
      }),
      createExternalLinkImport({
        id: "archived-import",
        fragmentId: archivedFragment.id,
      }),
    ]);

    await expect(findExistingExternalLinkImport(NORMALIZED_URL, database)).resolves.toMatchObject({
      externalLinkImport: { id: "archived-import" },
      fragment: { id: archivedFragment.id },
    });
  });

  it("returns null when matches belong only to deleted or missing fragments", async () => {
    await database.fragments.add(
      createStageTwoFragment({
        id: "deleted-fragment",
        lifecycleStatus: "deleted",
      }),
    );
    await database.externalLinkImports.bulkAdd([
      createExternalLinkImport({
        id: "deleted-import",
        fragmentId: "deleted-fragment",
      }),
      createExternalLinkImport({
        id: "orphan-import",
        fragmentId: "missing-fragment",
      }),
    ]);

    await expect(findExistingExternalLinkImport(NORMALIZED_URL, database)).resolves.toBeNull();
  });
});
