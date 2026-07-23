import { describe, expect, it } from "vitest";

import { PLANT_SLOT_IDS } from "../../../domain/plants/plant-slots";
import {
  GARDEN_MAP_CONFIG,
  GARDEN_MAP_HEIGHT,
  GARDEN_MAP_WIDTH,
  MINIMUM_PLANT_SLOT_DISTANCE,
  PLANT_SLOT_CONFIGS,
  type GardenRectangle,
} from "../../../game/config/garden-map";

function isPointInsideMap(x: number, y: number): boolean {
  return x >= 0 && x <= GARDEN_MAP_WIDTH && y >= 0 && y <= GARDEN_MAP_HEIGHT;
}

function isPointInsideRectangle(x: number, y: number, rectangle: GardenRectangle): boolean {
  return (
    x >= rectangle.x &&
    x <= rectangle.x + rectangle.width &&
    y >= rectangle.y &&
    y <= rectangle.y + rectangle.height
  );
}

describe("GARDEN_MAP_CONFIG", () => {
  it("uses the fixed 960 by 640 logical map and exposes future navigation anchors", () => {
    expect(GARDEN_MAP_CONFIG).toMatchObject({
      width: 960,
      height: 640,
    });
    expect(isPointInsideMap(GARDEN_MAP_CONFIG.playerSpawn.x, GARDEN_MAP_CONFIG.playerSpawn.y)).toBe(
      true,
    );
    expect(
      isPointInsideMap(
        GARDEN_MAP_CONFIG.companionPosition.x,
        GARDEN_MAP_CONFIG.companionPosition.y,
      ),
    ).toBe(true);
    expect(GARDEN_MAP_CONFIG.walkableAreas).not.toHaveLength(0);
    expect(GARDEN_MAP_CONFIG.obstacleAreas).not.toHaveLength(0);
  });

  it("contains every stage one slot exactly once", () => {
    const configuredIds = PLANT_SLOT_CONFIGS.map((slot) => slot.id);

    expect(configuredIds).toHaveLength(36);
    expect(new Set(configuredIds).size).toBe(36);
    expect(configuredIds).toEqual(PLANT_SLOT_IDS);
    expect(GARDEN_MAP_CONFIG.plantSlots).toBe(PLANT_SLOT_CONFIGS);
  });

  it("keeps plant and interaction coordinates inside the logical map", () => {
    for (const slot of PLANT_SLOT_CONFIGS) {
      expect(isPointInsideMap(slot.x, slot.y), `${slot.id} plant coordinate`).toBe(true);
      expect(
        isPointInsideMap(slot.interactionX, slot.interactionY),
        `${slot.id} interaction coordinate`,
      ).toBe(true);
    }
  });

  it("keeps plant coordinates away from the road, pond, and configured obstacles", () => {
    for (const slot of PLANT_SLOT_CONFIGS) {
      expect(
        isPointInsideRectangle(slot.x, slot.y, GARDEN_MAP_CONFIG.roadArea),
        `${slot.id} road overlap`,
      ).toBe(false);
      expect(
        isPointInsideRectangle(slot.x, slot.y, GARDEN_MAP_CONFIG.pondArea),
        `${slot.id} pond overlap`,
      ).toBe(false);

      for (const obstacle of GARDEN_MAP_CONFIG.obstacleAreas) {
        expect(
          isPointInsideRectangle(slot.x, slot.y, obstacle),
          `${slot.id} obstacle overlap`,
        ).toBe(false);
      }
    }
  });

  it("maintains a reasonable minimum distance between every pair of plants", () => {
    for (let leftIndex = 0; leftIndex < PLANT_SLOT_CONFIGS.length; leftIndex += 1) {
      const left = PLANT_SLOT_CONFIGS[leftIndex];

      if (left === undefined) {
        continue;
      }

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < PLANT_SLOT_CONFIGS.length;
        rightIndex += 1
      ) {
        const right = PLANT_SLOT_CONFIGS[rightIndex];

        if (right === undefined) {
          continue;
        }

        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        expect(distance, `${left.id} and ${right.id}`).toBeGreaterThanOrEqual(
          MINIMUM_PLANT_SLOT_DISTANCE,
        );
      }
    }
  });
});
