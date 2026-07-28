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
  it("builds a 30 by 20 grid from the Tiled collision layer", () => {
    const grid = createGardenWalkabilityGrid(GARDEN_MAP_CONFIG);

    expect(grid).toHaveLength(20);
    expect(grid[0]).toHaveLength(30);
    expect(() => validateGardenNavigationConfig(GARDEN_MAP_CONFIG, grid)).not.toThrow();
  });

  it("keeps every interaction point walkable, unique, and reachable in a full garden", () => {
    const fullGardenGrid = createGardenWalkabilityGrid(
      GARDEN_MAP_CONFIG,
      undefined,
      GARDEN_MAP_CONFIG.plantSlots.map((slot) => slot.id),
    );
    const pathfinding = new PathfindingSystem(GARDEN_MAP_CONFIG);
    const spawn = pathfinding.worldToGrid(GARDEN_MAP_CONFIG.playerSpawn);
    const interactionKeys = new Set<string>();

    expect(isWorldPositionAtGridCenter(GARDEN_MAP_CONFIG.playerSpawn, MOVEMENT_GRID_SIZE)).toBe(
      true,
    );
    expect(pathfinding.isWalkable(spawn)).toBe(true);

    for (const slot of GARDEN_MAP_CONFIG.plantSlots) {
      const plant = pathfinding.worldToGrid({ x: slot.x, y: slot.y });
      const interactionWorldPosition = {
        x: slot.interactionX,
        y: slot.interactionY,
      };
      const interaction = pathfinding.worldToGrid(interactionWorldPosition);
      const path = findPath({
        grid: fullGardenGrid,
        start: spawn,
        target: interaction,
      });

      expect(
        isWorldPositionAtGridCenter(interactionWorldPosition, MOVEMENT_GRID_SIZE),
        slot.id,
      ).toBe(true);
      expect(isGridPositionWalkable(fullGardenGrid, plant), `${slot.id} plant`).toBe(false);
      expect(isGridPositionWalkable(fullGardenGrid, interaction), `${slot.id} interaction`).toBe(
        true,
      );
      expect(
        Math.abs(plant.column - interaction.column) + Math.abs(plant.row - interaction.row),
        `${slot.id} adjacency`,
      ).toBe(1);
      expect(interactionKeys.has(gridPositionKey(interaction)), slot.id).toBe(false);
      expect(path, slot.id).not.toBeNull();
      interactionKeys.add(gridPositionKey(interaction));
    }

    expect(interactionKeys.size).toBe(36);
  });

  it("updates dynamic plant blockers without changing fixed map collisions", () => {
    const pathfinding = new PathfindingSystem(GARDEN_MAP_CONFIG);
    const firstPlant = GARDEN_MAP_CONFIG.plantSlots[0];
    const fixedCollision = GARDEN_MAP_CONFIG.collisionGridPositions[0];

    expect(firstPlant).toBeDefined();
    expect(fixedCollision).toBeDefined();

    if (firstPlant === undefined || fixedCollision === undefined) {
      return;
    }

    const plantPosition = pathfinding.worldToGrid({ x: firstPlant.x, y: firstPlant.y });

    expect(pathfinding.isWalkable(plantPosition)).toBe(true);
    expect(pathfinding.isWalkable(fixedCollision)).toBe(false);

    pathfinding.setOccupiedPlantSlots([firstPlant.id]);
    expect(pathfinding.isWalkable(plantPosition)).toBe(false);
    expect(pathfinding.isWalkable(fixedCollision)).toBe(false);

    pathfinding.setOccupiedPlantSlots([]);
    expect(pathfinding.isWalkable(plantPosition)).toBe(true);
    expect(pathfinding.isWalkable(fixedCollision)).toBe(false);
  });

  it("blocks water, trees, fences, and the map border while paths remain walkable", () => {
    const pathfinding = new PathfindingSystem(GARDEN_MAP_CONFIG);
    const waterCell = GARDEN_MAP_CONFIG.waterGridPositions.find((position) =>
      GARDEN_MAP_CONFIG.collisionGridPositions.some(
        (collision) => collision.column === position.column && collision.row === position.row,
      ),
    );
    const pathCell = GARDEN_MAP_CONFIG.pathGridPositions.find(
      (position) =>
        !GARDEN_MAP_CONFIG.collisionGridPositions.some(
          (collision) => collision.column === position.column && collision.row === position.row,
        ),
    );

    expect(waterCell).toBeDefined();
    expect(pathCell).toBeDefined();
    expect(pathfinding.isWalkable({ column: 0, row: 0 })).toBe(false);

    if (waterCell !== undefined) {
      expect(pathfinding.isWalkable(waterCell)).toBe(false);
    }

    if (pathCell !== undefined) {
      expect(pathfinding.isWalkable(pathCell)).toBe(true);
    }

    for (const blockedCell of [
      { column: 1, row: 5 },
      { column: 2, row: 18 },
      { column: 13, row: 1 },
    ]) {
      expect(pathfinding.isWalkable(blockedCell)).toBe(false);
    }
  });
});
