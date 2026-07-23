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

  it("does not score created, viewed, reviewed, or completed events", () => {
    const events = [
      createEvent("created", "2026-07-23T08:00:00.000Z"),
      createEvent("viewed", "2026-07-23T09:00:00.000Z"),
      createEvent("reviewed", "2026-07-23T10:00:00.000Z"),
      createEvent("completed", "2026-07-23T11:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(0);
  });

  it("counts the same event type once per UTC date", () => {
    const events = [
      createEvent("text_added", "2026-07-23T23:30:00.000-02:00"),
      createEvent("text_added", "2026-07-24T20:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(1);
  });

  it("counts the same event type again on a different UTC date", () => {
    const events = [
      createEvent("progress_recorded", "2026-07-23T23:30:00.000-02:00"),
      createEvent("progress_recorded", "2026-07-25T00:00:00.000Z"),
    ];

    expect(calculateGrowthScore(events)).toBe(4);
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
  ] as const)("maps event history to %s", (events, expectedStage) => {
    expect(resolvePlantStage(events, "open")).toBe(expectedStage);
  });

  it("makes completed fragments permanently bloom regardless of score", () => {
    expect(resolvePlantStage([], "completed")).toBe("permanent_bloom");
  });
});
