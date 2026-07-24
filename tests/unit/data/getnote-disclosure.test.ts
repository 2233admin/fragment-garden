import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FragmentGardenDatabase } from "../../../data/db";
import { acceptGetNoteDisclosure } from "../../../services/accept-getnote-disclosure";

const FIRST_ACCEPTED_AT = "2026-07-23T08:30:00.000Z";
const LATER_TIME = "2026-07-24T08:30:00.000Z";

let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(
    `fragment-garden-getnote-disclosure-${crypto.randomUUID()}`,
  );
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("acceptGetNoteDisclosure", () => {
  it("persists first-party settings and the acceptance time atomically", async () => {
    const settings = await acceptGetNoteDisclosure({ now: FIRST_ACCEPTED_AT }, { database });

    expect(settings).toEqual({
      id: "local-user",
      onboardingCompleted: false,
      companionType: null,
      lastOpenedAt: null,
      lastRecommendationDate: null,
      getNoteDisclosureAcceptedAt: FIRST_ACCEPTED_AT,
      openAiDisclosureAcceptedAt: null,
      companionAiMode: "local",
      sproutAiDisclosureAcceptedAt: null,
      schemaVersion: 1,
    });
    await expect(database.settings.get("local-user")).resolves.toEqual(settings);
  });

  it("keeps the original acceptance time when called repeatedly", async () => {
    await acceptGetNoteDisclosure({ now: FIRST_ACCEPTED_AT }, { database });

    const repeated = await acceptGetNoteDisclosure({ now: LATER_TIME }, { database });

    expect(repeated.getNoteDisclosureAcceptedAt).toBe(FIRST_ACCEPTED_AT);
    await expect(database.settings.count()).resolves.toBe(1);
  });

  it("does not pretend acceptance succeeded when Settings persistence fails", async () => {
    database.settings.hook("creating", () => {
      throw new Error("simulated disclosure persistence failure");
    });

    await expect(acceptGetNoteDisclosure({ now: FIRST_ACCEPTED_AT }, { database })).rejects.toThrow(
      "simulated disclosure persistence failure",
    );

    await expect(database.settings.count()).resolves.toBe(0);
  });
});
