import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Settings } from "../../../domain";
import { queryLocalSettings } from "../../../data/queries/companion-query";
import { FragmentGardenDatabase } from "../../../data/db";
import { acceptSproutDisclosure } from "../../../services/accept-sprout-disclosure";

const ACCEPTED_AT = "2026-07-24T08:30:00.000Z";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-sprout-disclosure-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("sprout AI disclosure", () => {
  it("reads a V3 settings record without treating an older AI disclosure as consent", async () => {
    const legacySettings: Settings = {
      id: "local-user",
      onboardingCompleted: true,
      companionType: "cat",
      lastOpenedAt: null,
      lastRecommendationDate: null,
      getNoteDisclosureAcceptedAt: "2026-07-22T08:00:00.000Z",
      openAiDisclosureAcceptedAt: "2026-07-23T08:00:00.000Z",
      companionAiMode: "openai",
      schemaVersion: 1,
    };
    await database.settings.add(legacySettings);

    await expect(queryLocalSettings(database)).resolves.toMatchObject({
      openAiDisclosureAcceptedAt: "2026-07-23T08:00:00.000Z",
      companionAiMode: "openai",
      sproutAiDisclosureAcceptedAt: null,
    });
  });

  it("persists independent sprout consent while preserving all existing settings", async () => {
    const stored: Settings = {
      id: "local-user",
      onboardingCompleted: true,
      companionType: "dog",
      lastOpenedAt: "2026-07-24T07:00:00.000Z",
      lastRecommendationDate: "2026-07-24",
      getNoteDisclosureAcceptedAt: "2026-07-22T08:00:00.000Z",
      openAiDisclosureAcceptedAt: "2026-07-23T08:00:00.000Z",
      companionAiMode: "local",
      imageAiDisclosureAcceptedAt: null,
      voiceAiDisclosureAcceptedAt: null,
      schemaVersion: 1,
    };
    await database.settings.add(stored);

    const accepted = await acceptSproutDisclosure({ now: ACCEPTED_AT }, { database });

    expect(accepted).toEqual({
      ...stored,
      sproutAiDisclosureAcceptedAt: ACCEPTED_AT,
    });
    await expect(database.settings.get("local-user")).resolves.toEqual(accepted);

    const repeated = await acceptSproutDisclosure(
      { now: "2026-07-25T08:30:00.000Z" },
      { database },
    );
    expect(repeated.sproutAiDisclosureAcceptedAt).toBe(ACCEPTED_AT);
    await expect(database.settings.count()).resolves.toBe(1);
  });

  it("does not leave consent behind when the settings write fails", async () => {
    database.settings.hook("creating", () => {
      throw new Error("simulated settings failure");
    });

    await expect(acceptSproutDisclosure({ now: ACCEPTED_AT }, { database })).rejects.toThrow(
      "simulated settings failure",
    );
    await expect(database.settings.count()).resolves.toBe(0);
  });
});
