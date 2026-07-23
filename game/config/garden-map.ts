import { PLANT_SLOT_IDS } from "../../domain/plants/plant-slots";

export const GARDEN_MAP_WIDTH = 960;
export const GARDEN_MAP_HEIGHT = 640;
export const MINIMUM_PLANT_SLOT_DISTANCE = 64;

export type GardenPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GardenRectangle = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

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
  walkableAreas: readonly GardenRectangle[];
  obstacleAreas: readonly GardenRectangle[];
  plantSlots: readonly PlantSlotConfig[];
}>;

const SLOT_COLUMNS = Object.freeze([120, 240, 360, 600, 720, 840]);
const SLOT_ROWS = Object.freeze([80, 150, 220, 420, 490, 560]);

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
  x: 24,
  y: 24,
  width: 388,
  height: 592,
});

const RIGHT_GRASS_AREA = Object.freeze({
  x: 548,
  y: 24,
  width: 388,
  height: 592,
});

const ROAD_AREA = Object.freeze({
  x: 430,
  y: 0,
  width: 100,
  height: GARDEN_MAP_HEIGHT,
});

const POND_AREA = Object.freeze({
  x: 675,
  y: 285,
  width: 110,
  height: 70,
});

const MAIN_WALKABLE_AREA = Object.freeze({
  x: 24,
  y: 24,
  width: 912,
  height: 592,
});

export const GARDEN_MAP_CONFIG: GardenMapConfig = Object.freeze({
  width: GARDEN_MAP_WIDTH,
  height: GARDEN_MAP_HEIGHT,
  playerSpawn: Object.freeze({ x: 480, y: 560 }),
  companionPosition: Object.freeze({ x: 480, y: 96 }),
  grassAreas: Object.freeze([LEFT_GRASS_AREA, RIGHT_GRASS_AREA]),
  roadArea: ROAD_AREA,
  pondArea: POND_AREA,
  walkableAreas: Object.freeze([MAIN_WALKABLE_AREA]),
  obstacleAreas: Object.freeze([POND_AREA]),
  plantSlots: PLANT_SLOT_CONFIGS,
});
