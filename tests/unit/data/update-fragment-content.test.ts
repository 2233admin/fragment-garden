import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { createLocalLinkFragment } from "../../../services/create-local-link-fragment";
import { updateFragmentContent } from "../../../services/update-fragment-content";
import {
  STAGE_TWO_TEST_DATE,
  STAGE_TWO_TEST_TIMESTAMP,
  createStageTwoDatabase,
  createStageTwoEvent,
  createStageTwoFragment,
  createStageTwoPlant,
  createIdSequence,
} from "./stage-two-fixtures";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = createStageTwoDatabase("update-content");
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("updateFragmentContent", () => {
  it("updates title and Markdown without changing legacy source text or growth events", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({
      vitality: "dormant",
      stage: "growing",
      growthScore: 2,
    });
    const existingEvent = createStageTwoEvent("created");
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    await database.fragmentEvents.add(existingEvent);

    const result = await updateFragmentContent(
      {
        fragmentId: fragment.id,
        title: "  修改后的标题  ",
        contentMarkdown: "  ## 保留正文格式\r\n以及换行  ",
      },
      {
        database,
        createId: createIdSequence(["restored-event"]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    expect(result.fragment).toMatchObject({
      title: "修改后的标题",
      rawText: fragment.rawText,
      contentMarkdown: "## 保留正文格式\n以及换行",
      lifecycleStatus: "active",
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
      lastInteractedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.plant).toMatchObject({
      vitality: "active",
      stage: "growing",
      growthScore: 2,
      updatedAt: STAGE_TWO_TEST_TIMESTAMP,
    });
    expect(result.restoredEvent).toMatchObject({
      id: "restored-event",
      type: "restored",
      payload: { reason: "content_updated" },
    });
    await expect(database.fragmentEvents.count()).resolves.toBe(2);
  });

  it("edits archived content without implicitly restoring its garden slot", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "archived" });
    const plant = createStageTwoPlant({ slotId: null });
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await updateFragmentContent(
      {
        fragmentId: fragment.id,
        title: "封存后的标题",
        contentMarkdown: "封存后仍可编辑",
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment.lifecycleStatus).toBe("archived");
    expect(result.plant.slotId).toBeNull();
    expect(result.restoredEvent).toBeNull();
  });

  it("derives a replacement title when the submitted title is blank", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    const result = await updateFragmentContent(
      {
        fragmentId: fragment.id,
        title: "   ",
        contentMarkdown: "\n## 新的 第一行\n第二行",
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment.title).toBe("新的 第一行");
  });

  it("rejects empty text without changing persisted data", async () => {
    const fragment = createStageTwoFragment();
    const plant = createStageTwoPlant();
    await database.fragments.add(fragment);
    await database.plants.add(plant);

    await expect(
      updateFragmentContent(
        { fragmentId: fragment.id, contentMarkdown: " \n\t " },
        { database, now: () => STAGE_TWO_TEST_DATE },
      ),
    ).rejects.toThrow("cannot be empty");

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });

  it("edits a link title without replacing its generated body or restarting import", async () => {
    const created = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/article",
        initiatedBy: "form",
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
      throw new Error("Expected the link fragment to be created");
    }

    const result = await updateFragmentContent(
      {
        fragmentId: created.fragment.id,
        title: "我补上的链接标题",
        contentMarkdown: "",
        editedFields: { title: true, contentMarkdown: false },
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );
    const storedImport = await database.externalLinkImports.get(created.externalLinkImport.id);

    expect(result.fragment).toMatchObject({
      title: "我补上的链接标题",
      rawText: null,
      contentMarkdown: created.fragment.contentMarkdown,
      analysisStatus: "pending",
    });
    expect(storedImport).toMatchObject({
      userProvidedTitle: true,
      userProvidedContent: false,
      status: "pending",
      attemptCount: 0,
      taskId: null,
    });
  });

  it("marks only changed link content as user-provided", async () => {
    const created = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/manual-content",
        initiatedBy: "form",
        now: STAGE_TWO_TEST_TIMESTAMP,
      },
      {
        database,
        createId: createIdSequence([
          "manual-content-fragment",
          "manual-content-plant",
          "manual-content-event",
          "manual-content-import",
        ]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    if (created.kind !== "created") {
      throw new Error("Expected the link fragment to be created");
    }

    await updateFragmentContent(
      {
        fragmentId: created.fragment.id,
        title: created.fragment.title,
        contentMarkdown: "用户手动补写的链接正文",
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    await expect(
      database.externalLinkImports.get(created.externalLinkImport.id),
    ).resolves.toMatchObject({
      userProvidedTitle: false,
      userProvidedContent: true,
    });
  });

  it("preserves a provider title when a stale form edits only the link body", async () => {
    const created = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/provider-title",
        initiatedBy: "form",
        now: STAGE_TWO_TEST_TIMESTAMP,
      },
      {
        database,
        createId: createIdSequence([
          "provider-title-fragment",
          "provider-title-plant",
          "provider-title-event",
          "provider-title-import",
        ]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    if (created.kind !== "created") {
      throw new Error("Expected the link fragment to be created");
    }

    await database.fragments.update(created.fragment.id, {
      title: "第三方刚写回的标题",
      contentMarkdown: "第三方正文",
    });

    const result = await updateFragmentContent(
      {
        fragmentId: created.fragment.id,
        title: created.fragment.title,
        contentMarkdown: "用户只修改了正文",
        editedFields: { title: false, contentMarkdown: true },
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment).toMatchObject({
      title: "第三方刚写回的标题",
      rawText: null,
      contentMarkdown: "用户只修改了正文",
    });
    await expect(
      database.externalLinkImports.get(created.externalLinkImport.id),
    ).resolves.toMatchObject({
      userProvidedTitle: false,
      userProvidedContent: true,
    });
  });

  it("preserves a provider body when a stale form edits only the link title", async () => {
    const created = await createLocalLinkFragment(
      {
        sourceUrl: "https://example.com/provider-content",
        initiatedBy: "form",
        now: STAGE_TWO_TEST_TIMESTAMP,
      },
      {
        database,
        createId: createIdSequence([
          "provider-content-fragment",
          "provider-content-plant",
          "provider-content-event",
          "provider-content-import",
        ]),
        now: () => STAGE_TWO_TEST_DATE,
      },
    );

    if (created.kind !== "created") {
      throw new Error("Expected the link fragment to be created");
    }

    await database.fragments.update(created.fragment.id, {
      title: "第三方标题",
      contentMarkdown: "第三方刚写回的正文",
    });

    const result = await updateFragmentContent(
      {
        fragmentId: created.fragment.id,
        title: "用户只修改了标题",
        contentMarkdown: "",
        editedFields: { title: true, contentMarkdown: false },
      },
      { database, now: () => STAGE_TWO_TEST_DATE },
    );

    expect(result.fragment).toMatchObject({
      title: "用户只修改了标题",
      rawText: null,
      contentMarkdown: "第三方刚写回的正文",
    });
    await expect(
      database.externalLinkImports.get(created.externalLinkImport.id),
    ).resolves.toMatchObject({
      userProvidedTitle: true,
      userProvidedContent: false,
    });
  });

  it("rolls back the fragment update when dormant plant restoration fails", async () => {
    const fragment = createStageTwoFragment({ lifecycleStatus: "dormant" });
    const plant = createStageTwoPlant({ vitality: "dormant" });
    await database.fragments.add(fragment);
    await database.plants.add(plant);
    database.plants.hook("updating", () => {
      throw new Error("Injected plant update failure");
    });

    await expect(
      updateFragmentContent(
        {
          fragmentId: fragment.id,
          title: "不应保存",
          contentMarkdown: "不应保存的正文",
        },
        { database, now: () => STAGE_TWO_TEST_DATE },
      ),
    ).rejects.toThrow("Injected plant update failure");

    await expect(database.fragments.get(fragment.id)).resolves.toEqual(fragment);
    await expect(database.plants.get(plant.id)).resolves.toEqual(plant);
  });
});
