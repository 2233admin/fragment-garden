export type GridPosition = Readonly<{
  column: number;
  row: number;
}>;

export type WorldPosition = Readonly<{
  x: number;
  y: number;
}>;

export type GridBounds = Readonly<{
  columns: number;
  rows: number;
}>;

export type WorldRectangle = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function createGridBounds(
  worldWidth: number,
  worldHeight: number,
  gridSize: number,
): GridBounds {
  requirePositiveInteger(worldWidth, "World width");
  requirePositiveInteger(worldHeight, "World height");
  requirePositiveInteger(gridSize, "Grid size");

  if (worldWidth % gridSize !== 0 || worldHeight % gridSize !== 0) {
    throw new Error("World dimensions must be divisible by the grid size");
  }

  return {
    columns: worldWidth / gridSize,
    rows: worldHeight / gridSize,
  };
}

export function worldToGridPosition(
  worldX: number,
  worldY: number,
  gridSize: number,
  bounds?: GridBounds,
): GridPosition {
  requirePositiveInteger(gridSize, "Grid size");

  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    throw new Error("World coordinates must be finite numbers");
  }

  const column = Math.floor(worldX / gridSize);
  const row = Math.floor(worldY / gridSize);

  if (bounds === undefined) {
    return { column, row };
  }

  requirePositiveInteger(bounds.columns, "Grid columns");
  requirePositiveInteger(bounds.rows, "Grid rows");

  return {
    column: clamp(column, 0, bounds.columns - 1),
    row: clamp(row, 0, bounds.rows - 1),
  };
}

export function gridToWorldPosition(gridPosition: GridPosition, gridSize: number): WorldPosition {
  requirePositiveInteger(gridSize, "Grid size");

  if (!Number.isInteger(gridPosition.column) || !Number.isInteger(gridPosition.row)) {
    throw new Error("Grid coordinates must be integers");
  }

  const halfGridSize = gridSize / 2;

  return {
    x: gridPosition.column * gridSize + halfGridSize,
    y: gridPosition.row * gridSize + halfGridSize,
  };
}

export function isSameGridPosition(left: GridPosition, right: GridPosition): boolean {
  return left.column === right.column && left.row === right.row;
}

export function isWorldPositionAtGridCenter(position: WorldPosition, gridSize: number): boolean {
  const gridPosition = worldToGridPosition(position.x, position.y, gridSize);
  const cellCenter = gridToWorldPosition(gridPosition, gridSize);
  return position.x === cellCenter.x && position.y === cellCenter.y;
}

export function isWorldPositionInsideRectangle(
  position: WorldPosition,
  rectangle: WorldRectangle,
): boolean {
  return (
    position.x >= rectangle.x &&
    position.x < rectangle.x + rectangle.width &&
    position.y >= rectangle.y &&
    position.y < rectangle.y + rectangle.height
  );
}

export function doWorldRectanglesOverlap(left: WorldRectangle, right: WorldRectangle): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}
