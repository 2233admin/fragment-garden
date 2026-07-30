import { describe, expect, it } from "vitest";

import { calculateGrowthScore, resolvePlantStage } from "../../../domain/growth/growth";
import type { FragmentEvent, FragmentEventType } from "../../../domain/shared/types";

function createEvent(type: FragmentEventType, occurredAt: string): FragmentEvent {
  return {
    id: `event-${type}-${occurredAt}`,
    fragmentId: "fragment-1",
    type,
    payload: null,
    occurredAt,
    ruleVersion: 1,
  };
}

function createPartnerSuggestionEvent(
  id: string,
  occurredAt: string,
  localDateKey: string,
): FragmentEvent {
  return {
    ...createEvent("partner_suggestion_saved", occurredAt),
    id,
    payload: {
      direction: "一个具体方向",
      guidingQuestion: "最想先验证什么？",
      recommendedAction: "record_next_step",
      source: "partner",
      promptVersion: "sprout-v1",
      localDateKey,
    },
  };
}

describe("calculateGrowthScore", () => {
  it.each([
    ["text_added", 1],
    ["link_added", 1],
    ["image_added", 1],
    ["audio_added", 1],
    ["next_step_added", 1],
    ["progress_recorded", 2],
    ["cluster_joined", 1],
    ["child_fragment_created", 2],
  ] satisfies ReadonlyArray<readonly [FragmentEventType, number]>)(
    "scores %s events",
    (eventType, expectedScore) => {
      expect(calculateGrowthScore([createEvent(eventType, "2026-07-23T08:00:00.000Z")])).toBe(
        expectedScore,
      );
    },
  );

  it("does not score created, viewed, reviewed, completed, or deleted events", () => {
    const events = [
      createEvent("created", "2026-07-23T08:00:00.000Z"),
      createEvent("viewed", "2026-07-23T09:00:00.000Z"),
      createEvent("reviewed", "2026-07-23T10:00:00.000Z"),
      createEvent("completed", "2026-07-23T11:00:00.000Z"),
      createEvent("deleted", "2026-07-23T12:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(0);
  });

  it("counts every independently saved text supplement on the same UTC date", () => {
    const events = [
      createEvent("text_added", "2026-07-23T23:30:00.000-02:00"),
      createEvent("text_added", "2026-07-24T20:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(2);
  });

  it("continues to deduplicate other event types on the same UTC date", () => {
    const events = [
      createEvent("progress_recorded", "2026-07-24T08:00:00.000Z"),
      createEvent("progress_recorded", "2026-07-24T20:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(2);
  });

  it("counts the same event type again on a different UTC date", () => {
    const events = [
      createEvent("progress_recorded", "2026-07-23T23:30:00.000-02:00"),
      createEvent("progress_recorded", "2026-07-25T00:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(4);
  });

  it("scores saved partner suggestions once per persisted browser-local date", () => {
    const events = [
      createPartnerSuggestionEvent("suggestion-one", "2026-07-24T15:30:00.000Z", "2026-07-24"),
      createPartnerSuggestionEvent("suggestion-two", "2026-07-25T01:00:00.000Z", "2026-07-24"),
      createPartnerSuggestionEvent("suggestion-three", "2026-07-25T16:30:00.000Z", "2026-07-25"),
    ];

    expect(calculateGrowthScore(events)).toBe(2);
  });

  it("does not guess a date for malformed partner suggestion events", () => {
    const event = createEvent("partner_suggestion_saved", "2026-07-24T08:00:00.000Z");

    expect(calculateGrowthScore([event])).toBe(0);
  });

  it("does not score a hidden or partially corrupted partner suggestion", () => {
    const incomplete = createPartnerSuggestionEvent(
      "incomplete-suggestion",
      "2026-07-24T08:00:00.000Z",
      "2026-07-24",
    );
    incomplete.payload = {
      source: "partner",
      localDateKey: "2026-07-24",
    };
    const withUnexpectedField = createPartnerSuggestionEvent(
      "unexpected-suggestion",
      "2026-07-25T08:00:00.000Z",
      "2026-07-25",
    );
    withUnexpectedField.payload = {
      ...withUnexpectedField.payload,
      unexpected: true,
    };

    expect(calculateGrowthScore([incomplete, withUnexpectedField])).toBe(0);
  });
});

describe("resolvePlantStage", () => {
  it("maps zero points to seedling", () => {
    expect(resolvePlantStage([], "open")).toBe("seedling");
  });

  it.each([
    [[createEvent("text_added", "2026-07-23T08:00:00.000Z")], "growing"],
    [[createEvent("progress_recorded", "2026-07-23T08:00:00.000Z")], "growing"],
    [
      [
        createEvent("progress_recorded", "2026-07-23T08:00:00.000Z"),
        createEvent("text_added", "2026-07-23T09:00:00.000Z"),
      ],
      "budding",
    ],
    [
      [
        createEvent("progress_recorded", "2026-07-23T08:00:00.000Z"),
        createEvent("child_fragment_created", "2026-07-23T09:00:00.000Z"),
      ],
      "budding",
    ],
    [
      [
        createEvent("progress_recorded", "2026-07-23T08:00:00.000Z"),
        createEvent("child_fragment_created", "2026-07-23T09:00:00.000Z"),
        createEvent("text_added", "2026-07-23T10:00:00.000Z"),
      ],
      "blooming",
    ],
    [
      [
        createEvent("progress_recorded", "2026-07-23T08:00:00.000Z"),
        createEvent("progress_recorded", "2026-07-24T08:00:00.000Z"),
        createEvent("child_fragment_created", "2026-07-23T09:00:00.000Z"),
      ],
      "blooming",
    ],
    [
      [
        createEvent("text_added", "2026-07-23T08:00:00.000Z"),
        createEvent("text_added", "2026-07-23T09:00:00.000Z"),
        createEvent("text_added", "2026-07-23T10:00:00.000Z"),
        createEvent("text_added", "2026-07-23T11:00:00.000Z"),
        createEvent("text_added", "2026-07-23T12:00:00.000Z"),
      ],
      "blooming",
    ],
  ] as const)("maps event history to %s", (events, expectedStage) => {
    expect(resolvePlantStage(events, "open")).toBe(expectedStage);
  });

  it("makes completed fragments permanently bloom regardless of score", () => {
    expect(resolvePlantStage([], "completed")).toBe("permanent_bloom");
  });
});
