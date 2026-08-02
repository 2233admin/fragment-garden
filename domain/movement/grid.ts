import {
  gridToWorldPosition,
  isWorldPositionInsideRectangle,
  type GridBounds,
  type GridPosition,
  type WorldRectangle,
} from "./geometry";

export type WalkabilityGrid = readonly (readonly boolean[])[];

export type CreateWalkabilityGridInput = Readonly<{
  bounds: GridBounds;
  gridSize: number;
  walkableAreas: readonly WorldRectangle[];
  obstacleAreas: readonly WorldRectangle[];
  blockedPositions?: readonly GridPosition[];
}>;

export function gridPositionKey(position: GridPosition): string {
  return `${position.column},${position.row}`;
}

export function isGridPositionInsideBounds(position: GridPosition, bounds: GridBounds): boolean {
  return (
    position.column >= 0 &&
    position.column < bounds.columns &&
    position.row >= 0 &&
    position.row < bounds.rows
  );
}

export function getWalkabilityGridBounds(grid: WalkabilityGrid): GridBounds {
  return {
    columns: grid[0]?.length ?? 0,
    rows: grid.length,
  };
}

export function isGridPositionWalkable(grid: WalkabilityGrid, position: GridPosition): boolean {
  const bounds = getWalkabilityGridBounds(grid);

  if (!isGridPositionInsideBounds(position, bounds)) {
    return false;
  }

  return grid[position.row]?.[position.column] === true;
}

export function createWalkabilityGrid({
  bounds,
  gridSize,
  walkableAreas,
  obstacleAreas,
  blockedPositions = [],
}: CreateWalkabilityGridInput): WalkabilityGrid {
  if (bounds.columns <= 0 || bounds.rows <= 0) {
    throw new Error("Walkability grid bounds must be positive");
  }

  const blockedPositionKeys = new Set(blockedPositions.map(gridPositionKey));
  const rows: Array<readonly boolean[]> = [];

  for (let row = 0; row < bounds.rows; row += 1) {
    const cells: boolean[] = [];

    for (let column = 0; column < bounds.columns; column += 1) {
      const position = { column, row };
      const worldPosition = gridToWorldPosition(position, gridSize);
      const isInWalkableArea = walkableAreas.some((area) =>
        isWorldPositionInsideRectangle(worldPosition, area),
      );
      const isInObstacle = obstacleAreas.some((area) =>
        isWorldPositionInsideRectangle(worldPosition, area),
      );

      cells.push(
        isInWalkableArea && !isInObstacle && !blockedPositionKeys.has(gridPositionKey(position)),
      );
    }

    rows.push(Object.freeze(cells));
  }

  return Object.freeze(rows);
}
