import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { cleanupSettledContentProcessingJobs } from "../../../services/content-processing-job-lifecycle";
import {
  createContentProcessingJobDatabase,
  createLinkProcessingJobRecord,
} from "./content-processing-job-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createContentProcessingJobDatabase("cleanup");
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

describe("cleanupSettledContentProcessingJobs", () => {
  it("removes settled temporary payloads but keeps retry and preview data", async () => {
    const temporaryBlob = new Blob(["temporary"], { type: "image/png" });
    await database.contentProcessingJobs.bulkAdd([
      createLinkProcessingJobRecord({
        id: "completed-image",
        kind: "image",
        status: "completed",
        sourceBlob: temporaryBlob,
        sourceMimeType: temporaryBlob.type,
        createdFragmentId: "formal-image",
      }),
      createLinkProcessingJobRecord({
        id: "cancelled-sprout",
        kind: "sprout",
        status: "cancelled",
        sourceFragmentId: "source",
        sourceSnapshot: "private snapshot",
        resultTitle: "temporary title",
        resultMarkdown: "temporary preview",
      }),
      createLinkProcessingJobRecord({
        id: "failed-image",
        kind: "image",
        status: "failed",
        sourceBlob: temporaryBlob,
        sourceMimeType: temporaryBlob.type,
      }),
      createLinkProcessingJobRecord({
        id: "sprout-preview",
        kind: "sprout",
        status: "awaiting_confirmation",
        sourceFragmentId: "source",
        sourceSnapshot: "needed snapshot",
        resultTitle: "preview title",
        resultMarkdown: "preview body",
      }),
    ]);

    await expect(cleanupSettledContentProcessingJobs({ database })).resolves.toBe(2);
    await expect(database.contentProcessingJobs.get("completed-image")).resolves.toMatchObject({
      sourceBlob: null,
    });
    await expect(database.contentProcessingJobs.get("cancelled-sprout")).resolves.toMatchObject({
      sourceSnapshot: null,
      resultTitle: null,
      resultMarkdown: null,
    });
    await expect(database.contentProcessingJobs.get("failed-image")).resolves.toMatchObject({
      sourceBlob: expect.any(Blob),
    });
    await expect(database.contentProcessingJobs.get("sprout-preview")).resolves.toMatchObject({
      sourceSnapshot: "needed snapshot",
      resultMarkdown: "preview body",
    });
  });
});
