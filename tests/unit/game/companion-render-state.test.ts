import { describe, expect, it } from "vitest";

import type { CompanionViewModel } from "../../../domain/garden/companion-view-model";
import { calculateCompanionRenderOperation } from "../../../game/systems/companion-render-state";

const CAT: CompanionViewModel = Object.freeze({ type: "cat" });
const DOG: CompanionViewModel = Object.freeze({ type: "dog" });

describe("calculateCompanionRenderOperation", () => {
  it("does not render before onboarding supplies a companion", () => {
    expect(calculateCompanionRenderOperation(null, null)).toEqual({ type: "none" });
  });

  it("creates exactly the selected companion from an empty state", () => {
    expect(calculateCompanionRenderOperation(null, CAT)).toEqual({
      type: "create",
      companion: CAT,
    });
  });

  it("does not create a duplicate for repeated SET_COMPANION events", () => {
    expect(calculateCompanionRenderOperation(CAT, { type: "cat" })).toEqual({
      type: "none",
    });
  });

  it("replaces the existing visual when the selected type changes", () => {
    expect(calculateCompanionRenderOperation(CAT, DOG)).toEqual({
      type: "replace",
      companion: DOG,
    });
  });

  it("removes the only companion when React sends null", () => {
    expect(calculateCompanionRenderOperation(DOG, null)).toEqual({
      type: "remove",
    });
  });

  it("does not modify either render input", () => {
    const previous = Object.freeze({ type: "cat" }) satisfies CompanionViewModel;
    const next = Object.freeze({ type: "dog" }) satisfies CompanionViewModel;

    calculateCompanionRenderOperation(previous, next);

    expect(previous).toEqual({ type: "cat" });
    expect(next).toEqual({ type: "dog" });
  });
});
