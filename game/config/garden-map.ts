import { PLANT_SLOT_IDS } from "../../domain/plants/plant-slots";
import type { WorldRectangle } from "../../domain/movement/geometry";

export const GARDEN_MAP_WIDTH = 960;
export const GARDEN_MAP_HEIGHT = 640;
export const MINIMUM_PLANT_SLOT_DISTANCE = 64;

export type GardenPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GardenRectangle = WorldRectangle;

export type PlantSlotConfig = Readonly<{
  id: string;
  x: number;
  y: number;
  interactionX: number;
  interactionY: number;
}>;

export type GardenMapConfig = Readonly<{
  width: number;
  height: number;
  playerSpawn: GardenPoint;
  companionPosition: GardenPoint;
  grassAreas: readonly GardenRectangle[];
  roadArea: GardenRectangle;
  pondArea: GardenRectangle;
  decorativeObstacleAreas: readonly GardenRectangle[];
  walkableAreas: readonly GardenRectangle[];
  obstacleAreas: readonly GardenRectangle[];
  plantSlots: readonly PlantSlotConfig[];
}>;

const SLOT_COLUMNS = Object.freeze([112, 240, 368, 592, 720, 848]);
const SLOT_ROWS = Object.freeze([80, 144, 208, 432, 496, 560]);

export const PLANT_SLOT_CONFIGS: readonly PlantSlotConfig[] = Object.freeze(
  PLANT_SLOT_IDS.map((id, index) => {
    const columnIndex = index % SLOT_COLUMNS.length;
    const rowIndex = Math.floor(index / SLOT_COLUMNS.length);
    const x = SLOT_COLUMNS[columnIndex];
    const y = SLOT_ROWS[rowIndex];

    if (x === undefined || y === undefined) {
      throw new Error(`No fixed coordinate configured for plant slot ${id}`);
    }

    return Object.freeze({
      id,
      x,
      y,
      interactionX: x,
      interactionY: y + 32,
    });
  }),
);

const LEFT_GRASS_AREA = Object.freeze({
  x: 32,
  y: 32,
  width: 384,
  height: 576,
});

const RIGHT_GRASS_AREA = Object.freeze({
  x: 544,
  y: 32,
  width: 384,
  height: 576,
});

const ROAD_AREA = Object.freeze({
  x: 432,
  y: 0,
  width: 96,
  height: GARDEN_MAP_HEIGHT,
});

const POND_AREA = Object.freeze({
  x: 672,
  y: 288,
  width: 128,
  height: 96,
});

const DECORATIVE_HEDGE_AREA = Object.freeze({
  x: 32,
  y: 288,
  width: 64,
  height: 96,
});

const MAIN_WALKABLE_AREA = Object.freeze({
  x: 32,
  y: 32,
  width: 896,
  height: 576,
});

export const GARDEN_MAP_CONFIG: GardenMapConfig = Object.freeze({
  width: GARDEN_MAP_WIDTH,
  height: GARDEN_MAP_HEIGHT,
  playerSpawn: Object.freeze({ x: 496, y: 560 }),
  companionPosition: Object.freeze({ x: 496, y: 112 }),
  grassAreas: Object.freeze([LEFT_GRASS_AREA, RIGHT_GRASS_AREA]),
  roadArea: ROAD_AREA,
  pondArea: POND_AREA,
  decorativeObstacleAreas: Object.freeze([DECORATIVE_HEDGE_AREA]),
  walkableAreas: Object.freeze([MAIN_WALKABLE_AREA]),
  obstacleAreas: Object.freeze([POND_AREA, DECORATIVE_HEDGE_AREA]),
  plantSlots: PLANT_SLOT_CONFIGS,
});
