import {
  createWalkabilityGrid,
  doWorldRectanglesOverlap,
  findPath,
  gridPositionKey,
  gridToWorldPosition,
  isGridPositionWalkable,
  isWorldPositionAtGridCenter,
  worldToGridPosition,
  type GridBounds,
  type GridPosition,
  type WalkabilityGrid,
  type WorldPosition,
} from "../../domain";
import type { GardenMapConfig } from "../config/garden-map";
import { GARDEN_GRID_BOUNDS, MOVEMENT_GRID_SIZE } from "../config/movement-config";

function requireNavigationInvariant(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Invalid garden navigation config: ${message}`);
  }
}

export function createGardenWalkabilityGrid(
  config: GardenMapConfig,
  bounds: GridBounds = GARDEN_GRID_BOUNDS,
): WalkabilityGrid {
  const blockedPlantPositions = config.plantSlots.map((slot) =>
    worldToGridPosition(slot.x, slot.y, MOVEMENT_GRID_SIZE, bounds),
  );

  return createWalkabilityGrid({
    bounds,
    gridSize: MOVEMENT_GRID_SIZE,
    walkableAreas: config.walkableAreas,
    obstacleAreas: config.obstacleAreas,
    blockedPositions: blockedPlantPositions,
  });
}

export function validateGardenNavigationConfig(
  config: GardenMapConfig,
  grid: WalkabilityGrid,
  bounds: GridBounds = GARDEN_GRID_BOUNDS,
): void {
  requireNavigationInvariant(
    !doWorldRectanglesOverlap(config.roadArea, config.pondArea),
    "the road and pond must not overlap",
  );
  requireNavigationInvariant(
    isWorldPositionAtGridCenter(config.playerSpawn, MOVEMENT_GRID_SIZE),
    "the player spawn must be at a grid cell center",
  );

  const spawnGridPosition = worldToGridPosition(
    config.playerSpawn.x,
    config.playerSpawn.y,
    MOVEMENT_GRID_SIZE,
    bounds,
  );
  requireNavigationInvariant(
    isGridPositionWalkable(grid, spawnGridPosition),
    "the player spawn must be walkable",
  );

  const interactionPositionKeys = new Set<string>();

  for (const slot of config.plantSlots) {
    const plantPosition = { x: slot.x, y: slot.y };
    const interactionPosition = {
      x: slot.interactionX,
      y: slot.interactionY,
    };
    requireNavigationInvariant(
      isWorldPositionAtGridCenter(plantPosition, MOVEMENT_GRID_SIZE),
      `${slot.id} plant position must be at a grid cell center`,
    );
    requireNavigationInvariant(
      isWorldPositionAtGridCenter(interactionPosition, MOVEMENT_GRID_SIZE),
      `${slot.id} interaction point must be at a grid cell center`,
    );

    const plantGridPosition = worldToGridPosition(slot.x, slot.y, MOVEMENT_GRID_SIZE, bounds);
    const interactionGridPosition = worldToGridPosition(
      slot.interactionX,
      slot.interactionY,
      MOVEMENT_GRID_SIZE,
      bounds,
    );
    const interactionPositionKey = gridPositionKey(interactionGridPosition);

    requireNavigationInvariant(
      !isGridPositionWalkable(grid, plantGridPosition),
      `${slot.id} plant cell must be blocked`,
    );
    requireNavigationInvariant(
      isGridPositionWalkable(grid, interactionGridPosition),
      `${slot.id} interaction point must be walkable`,
    );
    requireNavigationInvariant(
      !interactionPositionKeys.has(interactionPositionKey),
      `${slot.id} interaction point must be unique`,
    );
    interactionPositionKeys.add(interactionPositionKey);
    requireNavigationInvariant(
      findPath({
        grid,
        start: spawnGridPosition,
        target: interactionGridPosition,
      }) !== null,
      `${slot.id} interaction point must be reachable from the player spawn`,
    );
  }
}

export class PathfindingSystem {
  readonly bounds: GridBounds;
  readonly grid: WalkabilityGrid;
  readonly gridSize = MOVEMENT_GRID_SIZE;

  constructor(
    private readonly config: GardenMapConfig,
    bounds: GridBounds = GARDEN_GRID_BOUNDS,
  ) {
    this.bounds = bounds;
    this.grid = createGardenWalkabilityGrid(config, bounds);
    validateGardenNavigationConfig(config, this.grid, bounds);
  }

  isWorldPositionInsideMap(position: WorldPosition): boolean {
    return (
      position.x >= 0 &&
      position.x < this.config.width &&
      position.y >= 0 &&
      position.y < this.config.height
    );
  }

  worldToGrid(position: WorldPosition): GridPosition {
    return worldToGridPosition(position.x, position.y, MOVEMENT_GRID_SIZE, this.bounds);
  }

  gridToWorld(position: GridPosition): WorldPosition {
    return gridToWorldPosition(position, MOVEMENT_GRID_SIZE);
  }

  isWalkable(position: GridPosition): boolean {
    return isGridPositionWalkable(this.grid, position);
  }

  findPath(startWorldPosition: WorldPosition, target: GridPosition): GridPosition[] | null {
    return findPath({
      grid: this.grid,
      start: this.worldToGrid(startWorldPosition),
      target,
    });
  }
}
