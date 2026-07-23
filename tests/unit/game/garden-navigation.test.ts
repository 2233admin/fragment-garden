import { describe, expect, it } from "vitest";

import {
  findPath,
  gridPositionKey,
  isGridPositionWalkable,
  isWorldPositionAtGridCenter,
} from "../../../domain";
import { GARDEN_MAP_CONFIG } from "../../../game/config/garden-map";
import { MOVEMENT_GRID_SIZE } from "../../../game/config/movement-config";
import {
  createGardenWalkabilityGrid,
  PathfindingSystem,
  validateGardenNavigationConfig,
} from "../../../game/systems/PathfindingSystem";

describe("garden navigation configuration", () => {
  it("builds a 30 by 20 cached grid and validates the fixed map", () => {
    const grid = createGardenWalkabilityGrid(GARDEN_MAP_CONFIG);

    expect(grid).toHaveLength(20);
    expect(grid[0]).toHaveLength(30);
    expect(() => validateGardenNavigationConfig(GARDEN_MAP_CONFIG, grid)).not.toThrow();
  });

  it("keeps the spawn and every interaction point centered, walkable, unique, and reachable", () => {
    const pathfinding = new PathfindingSystem(GARDEN_MAP_CONFIG);
    const spawn = pathfinding.worldToGrid(GARDEN_MAP_CONFIG.playerSpawn);
    const interactionKeys = new Set<string>();

    expect(isWorldPositionAtGridCenter(GARDEN_MAP_CONFIG.playerSpawn, MOVEMENT_GRID_SIZE)).toBe(
      true,
    );
    expect(pathfinding.isWalkable(spawn)).toBe(true);

    for (const slot of GARDEN_MAP_CONFIG.plantSlots) {
      const interactionWorldPosition = {
        x: slot.interactionX,
        y: slot.interactionY,
      };
      const interaction = pathfinding.worldToGrid(interactionWorldPosition);
      const path = findPath({
        grid: pathfinding.grid,
        start: spawn,
        target: interaction,
      });

      expect(
        isWorldPositionAtGridCenter(interactionWorldPosition, MOVEMENT_GRID_SIZE),
        slot.id,
      ).toBe(true);
      expect(isGridPositionWalkable(pathfinding.grid, interaction), slot.id).toBe(true);
      expect(interactionKeys.has(gridPositionKey(interaction)), slot.id).toBe(false);
      expect(path, slot.id).not.toBeNull();
      expect(path?.at(-1), slot.id).toEqual(interaction);
      interactionKeys.add(gridPositionKey(interaction));
    }

    expect(interactionKeys.size).toBe(36);
  });

  it("blocks the pond, decorative hedge, map border, and plant cells", () => {
    const pathfinding = new PathfindingSystem(GARDEN_MAP_CONFIG);
    const pondCell = pathfinding.worldToGrid({ x: 688, y: 304 });
    const hedgeCell = pathfinding.worldToGrid({ x: 48, y: 304 });
    const borderCell = pathfinding.worldToGrid({ x: 16, y: 16 });
    const firstPlant = GARDEN_MAP_CONFIG.plantSlots[0];

    expect(pathfinding.isWalkable(pondCell)).toBe(false);
    expect(pathfinding.isWalkable(hedgeCell)).toBe(false);
    expect(pathfinding.isWalkable(borderCell)).toBe(false);
    expect(firstPlant).toBeDefined();

    if (firstPlant !== undefined) {
      expect(
        pathfinding.isWalkable(pathfinding.worldToGrid({ x: firstPlant.x, y: firstPlant.y })),
      ).toBe(false);
    }
  });
});
