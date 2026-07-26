import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findExistingLinkContent } from "../../../data/queries/content-processing-job-query";
import { ContentProcessingJobRepository } from "../../../data/repositories/content-processing-job-repository";
import { createLocalLinkFragment } from "../../../services/create-local-link-fragment";
import { createLinkProcessingJob } from "../../../services/create-link-processing-job";
import {
  PROCESSING_JOB_TEST_NOW,
  createContentProcessingJobDatabase,
  createLinkProcessingJobRecord,
} from "../services/content-processing-job-fixtures";

let database = createContentProcessingJobDatabase("repository-placeholder");

beforeEach(async () => {
  database = createContentProcessingJobDatabase("repository");
  await database.open();
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

describe("ContentProcessingJobRepository", () => {
  it("queries jobs by kind, status, and normalized URL in stable order", async () => {
    const repository = new ContentProcessingJobRepository(database);
    const later = createLinkProcessingJobRecord({ id: "job-b" });
    const earlier = createLinkProcessingJobRecord({
      id: "job-a",
      status: "processing",
      createdAt: "2026-07-25T08:00:00.000Z",
    });
    const image = createLinkProcessingJobRecord({
      id: "job-image",
      kind: "image",
      sourceUrl: null,
      normalizedSourceUrl: null,
    });
    await database.contentProcessingJobs.bulkAdd([later, image, earlier]);

    await expect(
      repository.listByKindAndStatuses("link", ["pending", "processing"]),
    ).resolves.toMatchObject([{ id: "job-a" }, { id: "job-b" }]);
    await expect(
      repository.listByKindsAndStatuses(["image", "link"], ["pending"]),
    ).resolves.toMatchObject([{ id: "job-b" }, { id: "job-image" }]);
    await expect(
      repository.listByNormalizedSourceUrl("https://example.com/article"),
    ).resolves.toMatchObject([{ id: "job-a" }, { id: "job-b" }]);
  });

  it("supports add, update, get, and delete", async () => {
    const repository = new ContentProcessingJobRepository(database);
    const job = createLinkProcessingJobRecord();
    await repository.add(job);
    await repository.update(job.id, {
      status: "failed",
      errorCode: "network_error",
      errorMessage: "稍后重试",
    });
    await expect(repository.getById(job.id)).resolves.toMatchObject({
      status: "failed",
      errorCode: "network_error",
      errorMessage: "稍后重试",
    });
    await repository.delete(job.id);
    await expect(repository.getById(job.id)).resolves.toBeUndefined();
  });
});

describe("createLinkProcessingJob", () => {
  it("creates only a local job before provider success", async () => {
    const input = {
      sourceUrl: " https://example.com/article?utm_source=test ",
      userTitle: " 用户标题 ",
      userNoteMarkdown: "补充内容",
      initiatedBy: "form" as const,
    };
    const snapshot = { ...input };
    const result = await createLinkProcessingJob(input, {
      database,
      createId: () => "job-created",
      now: () => new Date(PROCESSING_JOB_TEST_NOW),
    });

    expect(input).toEqual(snapshot);
    expect(result).toMatchObject({
      kind: "created",
      job: {
        id: "job-created",
        sourceUrl: "https://example.com/article?utm_source=test",
        normalizedSourceUrl: "https://example.com/article",
        userTitle: "用户标题",
        userNoteMarkdown: "补充内容",
      },
    });
    await expect(database.contentProcessingJobs.count()).resolves.toBe(1);
    await expect(database.fragments.count()).resolves.toBe(0);
    await expect(database.plants.count()).resolves.toBe(0);
    await expect(database.fragmentEvents.count()).resolves.toBe(0);
    await expect(database.externalLinkImports.count()).resolves.toBe(0);
  });

  it("returns an active job instead of creating a duplicate", async () => {
    const existing = createLinkProcessingJobRecord();
    await database.contentProcessingJobs.add(existing);

    await expect(
      createLinkProcessingJob(
        { sourceUrl: existing.sourceUrl!, initiatedBy: "form" },
        { database },
      ),
    ).resolves.toEqual({ kind: "duplicate_job", job: existing });
    await expect(database.contentProcessingJobs.count()).resolves.toBe(1);
  });

  it("returns an existing non-deleted formal link before creating a job", async () => {
    const existing = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/formal",
        initiatedBy: "form",
        now: PROCESSING_JOB_TEST_NOW,
      },
      { database },
    );
    expect(existing.kind).toBe("created");

    const result = await createLinkProcessingJob(
      { sourceUrl: "https://example.com/formal", initiatedBy: "form" },
      { database },
    );
    expect(result).toMatchObject({
      kind: "duplicate_fragment",
      fragment: { id: existing.kind === "created" ? existing.fragment.id : "" },
    });
    await expect(database.contentProcessingJobs.count()).resolves.toBe(0);
  });

  it("allows an explicit duplicate job", async () => {
    await database.contentProcessingJobs.add(createLinkProcessingJobRecord());
    const result = await createLinkProcessingJob(
      {
        sourceUrl: "https://example.com/article",
        initiatedBy: "form",
        allowDuplicate: true,
      },
      { database, createId: () => "duplicate-job" },
    );

    expect(result).toMatchObject({ kind: "created", job: { id: "duplicate-job" } });
    await expect(database.contentProcessingJobs.count()).resolves.toBe(2);
  });

  it("serializes concurrent duplicate checks", async () => {
    let id = 0;
    const input = { sourceUrl: "https://example.com/race", initiatedBy: "form" as const };
    const results = await Promise.all([
      createLinkProcessingJob(input, { database, createId: () => `job-${++id}` }),
      createLinkProcessingJob(input, { database, createId: () => `job-${++id}` }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["created", "duplicate_job"]);
    await expect(database.contentProcessingJobs.count()).resolves.toBe(1);
  });

  it("prefers formal content when both a completed job and a formal import exist", async () => {
    const existing = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/existing",
        initiatedBy: "form",
        now: PROCESSING_JOB_TEST_NOW,
      },
      { database },
    );
    await database.contentProcessingJobs.add(
      createLinkProcessingJobRecord({
        id: "completed-job",
        status: "completed",
        sourceUrl: "https://example.com/existing",
        normalizedSourceUrl: "https://example.com/existing",
      }),
    );

    const found = await findExistingLinkContent("https://example.com/existing", database);
    expect(found).toMatchObject({
      kind: "fragment",
      fragment: { id: existing.kind === "created" ? existing.fragment.id : "" },
    });
  });
});
