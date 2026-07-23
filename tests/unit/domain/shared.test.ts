import { describe, expect, it } from "vitest";

import { createUuid } from "../../../domain/shared/id";
import { toIsoTimestamp } from "../../../domain/shared/time";

describe("shared domain helpers", () => {
  it("creates UUID values", () => {
    const firstUuid = createUuid();
    const secondUuid = createUuid();

    expect(firstUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(secondUuid).not.toBe(firstUuid);
  });

  it("converts a Date to an ISO timestamp", () => {
    expect(toIsoTimestamp(new Date("2026-07-23T08:09:10.123Z"))).toBe("2026-07-23T08:09:10.123Z");
  });
});
