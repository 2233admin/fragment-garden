import {
  getWalkabilityGridBounds,
  gridPositionKey,
  isGridPositionInsideBounds,
  isGridPositionWalkable,
  type WalkabilityGrid,
} from "./grid";
import { isSameGridPosition, type GridPosition } from "./geometry";

export type FindPathInput = Readonly<{
  grid: WalkabilityGrid;
  start: GridPosition;
  target: GridPosition;
}>;

const CARDINAL_DIRECTIONS: readonly GridPosition[] = Object.freeze([
  Object.freeze({ column: 0, row: -1 }),
  Object.freeze({ column: 1, row: 0 }),
  Object.freeze({ column: 0, row: 1 }),
  Object.freeze({ column: -1, row: 0 }),
]);

function reconstructPath(
  parentByPosition: ReadonlyMap<string, GridPosition>,
  start: GridPosition,
  target: GridPosition,
): GridPosition[] {
  const reversedPath: GridPosition[] = [];
  let current = target;

  while (!isSameGridPosition(current, start)) {
    reversedPath.push(current);
    const parent = parentByPosition.get(gridPositionKey(current));

    if (parent === undefined) {
      throw new Error("Path parent chain is incomplete");
    }

    current = parent;
  }

  return reversedPath.reverse();
}

export function findPath({ grid, start, target }: FindPathInput): GridPosition[] | null {
  const bounds = getWalkabilityGridBounds(grid);

  if (
    !isGridPositionInsideBounds(start, bounds) ||
    !isGridPositionInsideBounds(target, bounds) ||
    !isGridPositionWalkable(grid, start) ||
    !isGridPositionWalkable(grid, target)
  ) {
    return null;
  }

  if (isSameGridPosition(start, target)) {
    return [];
  }

  const queue: GridPosition[] = [start];
  const visited = new Set<string>([gridPositionKey(start)]);
  const parentByPosition = new Map<string, GridPosition>();
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (current === undefined) {
      continue;
    }

    for (const direction of CARDINAL_DIRECTIONS) {
      const neighbor = {
        column: current.column + direction.column,
        row: current.row + direction.row,
      };
      const neighborKey = gridPositionKey(neighbor);

      if (visited.has(neighborKey) || !isGridPositionWalkable(grid, neighbor)) {
        continue;
      }

      visited.add(neighborKey);
      parentByPosition.set(neighborKey, current);

      if (isSameGridPosition(neighbor, target)) {
        return reconstructPath(parentByPosition, start, target);
      }

      queue.push(neighbor);
    }
  }

  return null;
}
