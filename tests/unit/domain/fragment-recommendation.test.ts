import { describe, expect, it } from "vitest";

import type { Fragment, Recommendation } from "../../../domain";
import {
  selectFragmentRecommendation,
  toLocalDateKey,
} from "../../../domain/recommendations/select-fragment-recommendation";
import { createStageTwoFragment } from "../data/stage-two-fixtures";

const NOW = new Date(2026, 6, 27, 15, 0, 0, 0);
const NOW_ISO = NOW.toISOString();

function hoursBeforeNow(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function createFragment(id: string, overrides: Partial<Fragment> = {}): Fragment {
  return createStageTwoFragment({
    id,
    createdAt: hoursBeforeNow(72),
    updatedAt: hoursBeforeNow(48),
    lastInteractedAt: hoursBeforeNow(48),
    ...overrides,
  });
}

function createRecommendation(
  fragmentId: string,
  shownAt: string,
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return {
    id: `recommendation-${fragmentId}`,
    fragmentId,
    reason: "not_reviewed",
    shownAt,
    openedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe("selectFragmentRecommendation", () => {
  it("excludes retired, completed, new, and already-shown-today fragments", () => {
    const eligible = createFragment("eligible");
    const fragments = [
      createFragment("deleted", { lifecycleStatus: "deleted" }),
      createFragment("archived", { lifecycleStatus: "archived" }),
      createFragment("completed", { completionStatus: "completed" }),
      createFragment("too-new", { createdAt: hoursBeforeNow(23.99) }),
      createFragment("shown-today"),
      eligible,
    ];
    const recommendations = [
      createRecommendation("shown-today", new Date(2026, 6, 27, 8).toISOString()),
    ];

    expect(selectFragmentRecommendation({ fragments, recommendations, now: NOW_ISO })).toBe(
      eligible,
    );
  });

  it("allows active and dormant open fragments exactly 24 hours old", () => {
    const dormant = createFragment("dormant", {
      lifecycleStatus: "dormant",
      createdAt: hoursBeforeNow(24),
      lastInteractedAt: hoursBeforeNow(96),
    });
    const active = createFragment("active", {
      lastInteractedAt: hoursBeforeNow(48),
    });

    expect(
      selectFragmentRecommendation({
        fragments: [active, dormant],
        recommendations: [],
        now: NOW_ISO,
      }),
    ).toBe(dormant);
  });

  it("sorts by oldest interaction, then creation, then id", () => {
    const sameInteraction = hoursBeforeNow(100);
    const laterCreated = createFragment("later-created", {
      lastInteractedAt: sameInteraction,
      createdAt: hoursBeforeNow(70),
    });
    const idB = createFragment("b", {
      lastInteractedAt: sameInteraction,
      createdAt: hoursBeforeNow(80),
    });
    const idA = createFragment("a", {
      lastInteractedAt: sameInteraction,
      createdAt: hoursBeforeNow(80),
    });

    expect(
      selectFragmentRecommendation({
        fragments: [laterCreated, idB, idA],
        recommendations: [],
        now: NOW_ISO,
      }),
    ).toBe(idA);
  });

  it("uses browser-local dates across UTC offsets", () => {
    const shownToday = new Date(2026, 6, 27, 0, 1).toISOString();
    const shownYesterday = new Date(2026, 6, 26, 23, 59).toISOString();

    expect(toLocalDateKey(shownToday)).toBe(toLocalDateKey(NOW_ISO));
    expect(toLocalDateKey(shownYesterday)).not.toBe(toLocalDateKey(NOW_ISO));
  });

  it("returns null without modifying either input", () => {
    const fragment = createFragment("new", { createdAt: hoursBeforeNow(1) });
    const recommendation = createRecommendation("other", hoursBeforeNow(24));
    const fragments = [fragment];
    const recommendations = [recommendation];
    const fragmentsSnapshot = structuredClone(fragments);
    const recommendationsSnapshot = structuredClone(recommendations);

    expect(selectFragmentRecommendation({ fragments, recommendations, now: NOW_ISO })).toBeNull();
    expect(fragments).toEqual(fragmentsSnapshot);
    expect(recommendations).toEqual(recommendationsSnapshot);
  });
});
