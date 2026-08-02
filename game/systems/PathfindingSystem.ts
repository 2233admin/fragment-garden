import {
  createWalkabilityGrid,
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
  occupiedSlotIds: readonly string[] = [],
): WalkabilityGrid {
  const slotById = new Map(config.plantSlots.map((slot) => [slot.id, slot] as const));
  const blockedPositions = [
    ...config.collisionGridPositions,
    ...occupiedSlotIds.map((slotId) => {
      const slot = slotById.get(slotId);

      if (slot === undefined) {
        throw new Error(`Unknown occupied garden slot: ${slotId}`);
      }

      return worldToGridPosition(slot.x, slot.y, MOVEMENT_GRID_SIZE, bounds);
    }),
  ];

  return createWalkabilityGrid({
    bounds,
    gridSize: MOVEMENT_GRID_SIZE,
    walkableAreas: config.walkableAreas,
    obstacleAreas: [],
    blockedPositions,
  });
}

export function validateGardenNavigationConfig(
  config: GardenMapConfig,
  grid: WalkabilityGrid,
  bounds: GridBounds = GARDEN_GRID_BOUNDS,
): void {
  requireNavigationInvariant(
    isWorldPositionAtGridCenter(config.playerSpawn, MOVEMENT_GRID_SIZE),
    "the player spawn must be at a grid cell center",
  );
  requireNavigationInvariant(
    isWorldPositionAtGridCenter(config.companionPosition, MOVEMENT_GRID_SIZE),
    "the companion position must be at a grid cell center",
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

  const companionGridPosition = worldToGridPosition(
    config.companionPosition.x,
    config.companionPosition.y,
    MOVEMENT_GRID_SIZE,
    bounds,
  );
  requireNavigationInvariant(
    isGridPositionWalkable(grid, companionGridPosition),
    "the companion position must be walkable",
  );

  const fullGardenGrid = createGardenWalkabilityGrid(
    config,
    bounds,
    config.plantSlots.map((slot) => slot.id),
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
      isGridPositionWalkable(grid, plantGridPosition),
      `${slot.id} empty plant cell must be walkable`,
    );
    requireNavigationInvariant(
      !isGridPositionWalkable(fullGardenGrid, plantGridPosition),
      `${slot.id} occupied plant cell must be blocked`,
    );
    requireNavigationInvariant(
      isGridPositionWalkable(fullGardenGrid, interactionGridPosition),
      `${slot.id} interaction point must be walkable in a full garden`,
    );
    requireNavigationInvariant(
      !interactionPositionKeys.has(interactionPositionKey),
      `${slot.id} interaction point must be unique`,
    );
    interactionPositionKeys.add(interactionPositionKey);
    requireNavigationInvariant(
      findPath({
        grid: fullGardenGrid,
        start: spawnGridPosition,
        target: interactionGridPosition,
      }) !== null,
      `${slot.id} interaction point must be reachable from the player spawn`,
    );
  }
}

export class PathfindingSystem {
  readonly bounds: GridBounds;
  readonly gridSize = MOVEMENT_GRID_SIZE;
  private currentGrid: WalkabilityGrid;

  constructor(
    private readonly config: GardenMapConfig,
    bounds: GridBounds = GARDEN_GRID_BOUNDS,
  ) {
    this.bounds = bounds;
    this.currentGrid = createGardenWalkabilityGrid(config, bounds);
    validateGardenNavigationConfig(config, this.currentGrid, bounds);
  }

  get grid(): WalkabilityGrid {
    return this.currentGrid;
  }

  setOccupiedPlantSlots(slotIds: readonly string[]): void {
    this.currentGrid = createGardenWalkabilityGrid(this.config, this.bounds, slotIds);
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
    return isGridPositionWalkable(this.currentGrid, position);
  }

  findPath(startWorldPosition: WorldPosition, target: GridPosition): GridPosition[] | null {
    return findPath({
      grid: this.currentGrid,
      start: this.worldToGrid(startWorldPosition),
      target,
    });
  }
}
