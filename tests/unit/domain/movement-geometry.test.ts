import { describe, expect, it } from "vitest";

import { createGridBounds, gridToWorldPosition, worldToGridPosition } from "../../../domain";

describe("movement coordinate conversion", () => {
  const bounds = createGridBounds(960, 640, 32);

  it("converts world coordinates to stable grid positions", () => {
    expect(worldToGridPosition(16, 16, 32)).toEqual({ column: 0, row: 0 });
    expect(worldToGridPosition(112, 176, 32)).toEqual({ column: 3, row: 5 });
    expect(worldToGridPosition(112, 176, 32)).toEqual(worldToGridPosition(112, 176, 32));
  });

  it("converts grid positions to cell-center world coordinates", () => {
    expect(gridToWorldPosition({ column: 0, row: 0 }, 32)).toEqual({ x: 16, y: 16 });
    expect(gridToWorldPosition({ column: 29, row: 19 }, 32)).toEqual({
      x: 944,
      y: 624,
    });
  });

  it("clamps clicks at and beyond map edges into the configured grid", () => {
    expect(worldToGridPosition(-5, -1, 32, bounds)).toEqual({ column: 0, row: 0 });
    expect(worldToGridPosition(959.9, 639.9, 32, bounds)).toEqual({
      column: 29,
      row: 19,
    });
    expect(worldToGridPosition(960, 640, 32, bounds)).toEqual({
      column: 29,
      row: 19,
    });
  });

  it("requires world dimensions that divide cleanly into the grid", () => {
    expect(() => createGridBounds(961, 640, 32)).toThrow(/divisible/u);
  });
});
