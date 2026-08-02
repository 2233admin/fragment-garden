import { describe, expect, it } from "vitest";

import { shouldFragmentBeDormant } from "../../../domain/fragments/dormancy";

const LAST_INTERACTED_AT = "2026-07-20T00:00:00.000Z";

describe("shouldFragmentBeDormant", () => {
  it("does not make a fragment dormant at 71 hours and 59 minutes", () => {
    expect(
      shouldFragmentBeDormant({
        lastInteractedAt: LAST_INTERACTED_AT,
        completionStatus: "open",
        now: "2026-07-22T23:59:00.000Z",
      }),
    ).toBe(false);
  });

  it("makes a fragment dormant at exactly 72 hours", () => {
    expect(
      shouldFragmentBeDormant({
        lastInteractedAt: LAST_INTERACTED_AT,
        completionStatus: "open",
        now: "2026-07-23T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("makes a fragment dormant after 72 hours", () => {
    expect(
      shouldFragmentBeDormant({
        lastInteractedAt: LAST_INTERACTED_AT,
        completionStatus: "open",
        now: "2026-07-23T00:01:00.000Z",
      }),
    ).toBe(true);
  });

  it("never makes a completed fragment dormant", () => {
    expect(
      shouldFragmentBeDormant({
        lastInteractedAt: LAST_INTERACTED_AT,
        completionStatus: "completed",
        now: "2026-08-20T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});
