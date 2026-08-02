import { describe, expect, it } from "vitest";

import {
  createWalkabilityGrid,
  findPath,
  type GridPosition,
  type WalkabilityGrid,
} from "../../../domain";

function createGrid(rows: readonly (readonly boolean[])[]): WalkabilityGrid {
  return rows.map((row) => [...row]);
}

function expectCardinalPath(path: readonly GridPosition[]): void {
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];

    if (previous === undefined || current === undefined) {
      continue;
    }

    expect(Math.abs(previous.column - current.column) + Math.abs(previous.row - current.row)).toBe(
      1,
    );
  }
}

describe("walkability grid", () => {
  it("combines walkable areas, obstacles, and occupied plant cells", () => {
    const grid = createWalkabilityGrid({
      bounds: { columns: 4, rows: 3 },
      gridSize: 10,
      walkableAreas: [{ x: 0, y: 0, width: 40, height: 30 }],
      obstacleAreas: [{ x: 10, y: 10, width: 10, height: 10 }],
      blockedPositions: [{ column: 3, row: 2 }],
    });

    expect(grid).toEqual([
      [true, true, true, true],
      [true, false, true, true],
      [true, true, true, false],
    ]);
  });
});

describe("deterministic four-direction pathfinding", () => {
  it("returns a straight path without including the start", () => {
    const grid = createGrid([
      [true, true, true, true],
      [true, true, true, true],
    ]);

    expect(
      findPath({
        grid,
        start: { column: 0, row: 0 },
        target: { column: 3, row: 0 },
      }),
    ).toEqual([
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      { column: 3, row: 0 },
    ]);
  });

  it("takes a stable cardinal route around an obstacle", () => {
    const grid = createGrid([
      [true, true, true, true],
      [true, false, false, true],
      [true, true, true, true],
    ]);
    const input = {
      grid,
      start: { column: 0, row: 1 },
      target: { column: 3, row: 1 },
    };
    const firstPath = findPath(input);
    const secondPath = findPath(input);

    expect(firstPath).toEqual(secondPath);
    expect(firstPath?.at(-1)).toEqual(input.target);
    expectCardinalPath([input.start, ...(firstPath ?? [])]);
  });

  it("returns an empty path when start and target are the same walkable cell", () => {
    const grid = createGrid([[true]]);

    expect(
      findPath({
        grid,
        start: { column: 0, row: 0 },
        target: { column: 0, row: 0 },
      }),
    ).toEqual([]);
  });

  it("returns null for blocked, unreachable, or out-of-bounds targets", () => {
    const blockedTargetGrid = createGrid([[true, false]]);
    const separatedGrid = createGrid([
      [true, false, true],
      [true, false, true],
    ]);

    expect(
      findPath({
        grid: blockedTargetGrid,
        start: { column: 0, row: 0 },
        target: { column: 1, row: 0 },
      }),
    ).toBeNull();
    expect(
      findPath({
        grid: separatedGrid,
        start: { column: 0, row: 0 },
        target: { column: 2, row: 0 },
      }),
    ).toBeNull();
    expect(
      findPath({
        grid: separatedGrid,
        start: { column: 0, row: 0 },
        target: { column: 3, row: 0 },
      }),
    ).toBeNull();
  });

  it("does not mutate its input grid", () => {
    const grid = createGrid([
      [true, true],
      [true, true],
    ]);
    const before = grid.map((row) => [...row]);

    findPath({
      grid,
      start: { column: 0, row: 0 },
      target: { column: 1, row: 1 },
    });

    expect(grid).toEqual(before);
  });
});
