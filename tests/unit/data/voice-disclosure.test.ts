import "fake-indexeddb/auto";

import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Settings } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";
import { queryLocalSettings } from "../../../data/queries/companion-query";
import { acceptVoiceDisclosure } from "../../../services/accept-voice-disclosure";

const ACCEPTED_AT = "2026-07-24T08:30:00.000Z";
let database: FragmentGardenDatabase;

beforeEach(async () => {
  database = new FragmentGardenDatabase(`fragment-garden-voice-disclosure-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe("voice AI disclosure", () => {
  it("keeps voice consent independent from older disclosures", async () => {
    const stored: Settings = {
      id: "local-user",
      onboardingCompleted: true,
      companionType: "cat",
      lastOpenedAt: null,
      lastRecommendationDate: null,
      getNoteDisclosureAcceptedAt: "2026-07-22T08:00:00.000Z",
      openAiDisclosureAcceptedAt: "2026-07-23T08:00:00.000Z",
      companionAiMode: "openai",
      sproutAiDisclosureAcceptedAt: "2026-07-23T09:00:00.000Z",
      imageAiDisclosureAcceptedAt: ACCEPTED_AT,
      voiceAiDisclosureAcceptedAt: null,
      schemaVersion: 1,
    };
    await database.settings.add(stored);

    await expect(queryLocalSettings(database)).resolves.toMatchObject({
      imageAiDisclosureAcceptedAt: ACCEPTED_AT,
      voiceAiDisclosureAcceptedAt: null,
    });

    const accepted = await acceptVoiceDisclosure({ now: ACCEPTED_AT }, { database });
    expect(accepted.voiceAiDisclosureAcceptedAt).toBe(ACCEPTED_AT);
    expect(accepted.openAiDisclosureAcceptedAt).toBe(stored.openAiDisclosureAcceptedAt);
    expect(accepted.sproutAiDisclosureAcceptedAt).toBe(stored.sproutAiDisclosureAcceptedAt);
  });

  it("does not persist consent when the settings write fails", async () => {
    database.settings.hook("creating", () => {
      throw new Error("simulated settings failure");
    });

    await expect(acceptVoiceDisclosure({ now: ACCEPTED_AT }, { database })).rejects.toThrow(
      "simulated settings failure",
    );
    await expect(database.settings.count()).resolves.toBe(0);
  });
});
