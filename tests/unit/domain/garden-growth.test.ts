import { describe, expect, it } from "vitest";

import {
  getGardenGrowthStage,
  getGardenZoneGrowthLevel,
  getPreviewZoneGrowthLevel,
} from "../../../domain/garden/garden-growth";

describe("garden growth rules", () => {
  it.each([
    [0, 0],
    [3, 0],
    [4, 1],
    [9, 1],
    [10, 2],
    [18, 2],
    [19, 3],
    [27, 3],
    [28, 4],
    [36, 4],
  ] as const)("maps %i placed plants to global stage %i", (count, expectedStage) => {
    expect(getGardenGrowthStage(count)).toBe(expectedStage);
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
  ] as const)("maps %i zone plants to local level %i", (count, expectedLevel) => {
    expect(getGardenZoneGrowthLevel(count)).toBe(expectedLevel);
  });

  it("normalizes invalid counts without exposing an invalid stage", () => {
    expect(getGardenGrowthStage(-1)).toBe(0);
    expect(getGardenGrowthStage(Number.NaN)).toBe(0);
    expect(getGardenGrowthStage(Number.POSITIVE_INFINITY)).toBe(0);
    expect(getGardenGrowthStage(4.9)).toBe(1);
    expect(getGardenZoneGrowthLevel(-1)).toBe(0);
    expect(getGardenZoneGrowthLevel(Number.NaN)).toBe(0);
    expect(getGardenZoneGrowthLevel(99)).toBe(3);
  });

  it("maps preview stages onto the three local growth levels", () => {
    expect(
      [0, 1, 2, 3, 4].map((stage) => getPreviewZoneGrowthLevel(stage as 0 | 1 | 2 | 3 | 4)),
    ).toEqual([0, 1, 2, 3, 3]);
  });
});
