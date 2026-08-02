import { describe, expect, it } from "vitest";

import {
  parseArchivedEventPayload,
  parseChildFragmentCreatedEventPayload,
  parseCompletedEventPayload,
  parsePartnerSuggestionSavedEventPayload,
  parseRestoredEventPayload,
  parseReviewedEventPayload,
  safelyParseCompletedEventPayload,
  safelyParsePartnerSuggestionSavedEventPayload,
  safelyParseReviewedEventPayload,
} from "../../../validation/fragment-event-payload";

describe("fragment event payload validation", () => {
  it("accepts every supported review decision and rejects unknown values", () => {
    expect(parseReviewedEventPayload({ decision: "still_interested" })).toEqual({
      decision: "still_interested",
    });
    expect(parseReviewedEventPayload({ decision: "not_now" })).toEqual({
      decision: "not_now",
    });
    expect(parseReviewedEventPayload({ decision: "no_longer_needed" })).toEqual({
      decision: "no_longer_needed",
    });
    expect(safelyParseReviewedEventPayload({ decision: "later" })).toBeNull();
  });

  it("normalizes a blank outcome to null and enforces its length limit", () => {
    expect(parseCompletedEventPayload({ outcome: "  " })).toEqual({ outcome: null });
    expect(parseCompletedEventPayload({ outcome: "  做成了原型  " })).toEqual({
      outcome: "做成了原型",
    });
    expect(safelyParseCompletedEventPayload({ outcome: "长".repeat(301) })).toBeNull();
  });

  it("strictly validates child, archive and restore payloads", () => {
    expect(parseChildFragmentCreatedEventPayload({ childFragmentId: " child-1 " })).toEqual({
      childFragmentId: "child-1",
    });
    expect(parseArchivedEventPayload({ previousSlotId: null })).toEqual({
      previousSlotId: null,
    });
    expect(parseRestoredEventPayload({ reason: "manual_restore" })).toEqual({
      reason: "manual_restore",
    });

    expect(() =>
      parseRestoredEventPayload({ reason: "manual_restore", unexpected: true }),
    ).toThrow();
  });

  it("strictly validates structured partner suggestions and their local date key", () => {
    const payload = {
      direction: "  先明确希望减少的分心场景  ",
      guidingQuestion: "  哪个时段最值得先观察？  ",
      recommendedAction: "record_next_step" as const,
      source: "partner" as const,
      promptVersion: " sprout-v1 ",
      localDateKey: "2026-07-24",
    };

    expect(parsePartnerSuggestionSavedEventPayload(payload)).toEqual({
      direction: "先明确希望减少的分心场景",
      guidingQuestion: "哪个时段最值得先观察？",
      recommendedAction: "record_next_step",
      source: "partner",
      promptVersion: "sprout-v1",
      localDateKey: "2026-07-24",
    });
    expect(
      safelyParsePartnerSuggestionSavedEventPayload({
        ...payload,
        localDateKey: "2026-02-30",
      }),
    ).toBeNull();
    expect(
      safelyParsePartnerSuggestionSavedEventPayload({
        ...payload,
        recommendedAction: "delete_fragment",
      }),
    ).toBeNull();
    expect(
      safelyParsePartnerSuggestionSavedEventPayload({ ...payload, unexpected: true }),
    ).toBeNull();
  });

  it("uses the same Unicode character limits as the sprout response", () => {
    const payload = {
      direction: "🌱".repeat(500),
      guidingQuestion: "继续吗？",
      recommendedAction: "add_content" as const,
      source: "partner" as const,
      promptVersion: "sprout-v1",
      localDateKey: "2026-07-24",
    };

    expect(parsePartnerSuggestionSavedEventPayload(payload).direction).toBe(payload.direction);
    expect(
      safelyParsePartnerSuggestionSavedEventPayload({
        ...payload,
        direction: `${payload.direction}🌱`,
      }),
    ).toBeNull();
  });
});
