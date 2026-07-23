import { describe, expect, it } from "vitest";

import {
  parseArchivedEventPayload,
  parseChildFragmentCreatedEventPayload,
  parseCompletedEventPayload,
  parseRestoredEventPayload,
  parseReviewedEventPayload,
  safelyParseCompletedEventPayload,
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
});
