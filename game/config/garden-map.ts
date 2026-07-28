import { PLANT_SLOT_IDS } from "../../domain/plants/plant-slots";
import type { GridPosition, WorldRectangle } from "../../domain/movement/geometry";
import {
  getGardenMapAnchors,
  getGardenTileLayer,
  TILED_GARDEN_MAP_DATA,
  validateTiledGardenMapData,
} from "./tiled-garden-map";
import { GARDEN_ZONE_IDS, type GardenZoneId } from "./garden-zones";

export const GARDEN_MAP_TILE_SIZE = 32;
export const GARDEN_MAP_COLUMNS = 30;
export const GARDEN_MAP_ROWS = 20;
export const GARDEN_MAP_WIDTH = GARDEN_MAP_COLUMNS * GARDEN_MAP_TILE_SIZE;
export const GARDEN_MAP_HEIGHT = GARDEN_MAP_ROWS * GARDEN_MAP_TILE_SIZE;
export const MINIMUM_PLANT_SLOT_DISTANCE = 64;

export type GardenPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GardenRectangle = WorldRectangle;

export type PlantSlotConfig = Readonly<{
  id: string;
  interactionX: number;
  interactionY: number;
  x: number;
  y: number;
  zoneId: GardenZoneId;
}>;

export type GardenMapConfig = Readonly<{
  collisionGridPositions: readonly GridPosition[];
  companionPosition: GardenPoint;
  height: number;
  pathGridPositions: readonly GridPosition[];
  plantSlots: readonly PlantSlotConfig[];
  playerSpawn: GardenPoint;
  tileSize: number;
  walkableAreas: readonly GardenRectangle[];
  waterGridPositions: readonly GridPosition[];
  width: number;
}>;

validateTiledGardenMapData();

function requireGardenMapInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid garden map config: ${message}`);
  }
}

function getNumberProperty(properties: ReadonlyMap<string, unknown>, name: string): number {
  const value = properties.get(name);
  requireGardenMapInvariant(typeof value === "number" && Number.isFinite(value), `${name} missing`);
  return value;
}

function getStringProperty(properties: ReadonlyMap<string, unknown>, name: string): string {
  const value = properties.get(name);
  requireGardenMapInvariant(typeof value === "string" && value.length > 0, `${name} missing`);
  return value;
}

function getZoneIdProperty(properties: ReadonlyMap<string, unknown>, name: string): GardenZoneId {
  const value = getStringProperty(properties, name);
  requireGardenMapInvariant(
    GARDEN_ZONE_IDS.some((zoneId) => zoneId === value),
    `${name} is invalid`,
  );
  return value as GardenZoneId;
}

function getLayerGridPositions(name: "Collision" | "Path" | "Water"): readonly GridPosition[] {
  const layer = getGardenTileLayer(name);
  const positions: GridPosition[] = [];

  for (const [index, gid] of layer.data.entries()) {
    if (gid === 0) {
      continue;
    }

    positions.push(
      Object.freeze({
        column: index % GARDEN_MAP_COLUMNS,
        row: Math.floor(index / GARDEN_MAP_COLUMNS),
      }),
    );
  }

  return Object.freeze(positions);
}

const anchors = getGardenMapAnchors();

function getAnchor(anchorType: "player-spawn" | "companion"): GardenPoint {
  const anchor = anchors.find((candidate) => candidate.properties.get("anchorType") === anchorType);
  requireGardenMapInvariant(anchor !== undefined, `${anchorType} anchor missing`);
  return Object.freeze({ x: anchor.x, y: anchor.y });
}

export const PLANT_SLOT_CONFIGS: readonly PlantSlotConfig[] = Object.freeze(
  PLANT_SLOT_IDS.map((id) => {
    const anchor = anchors.find(
      (candidate) =>
        candidate.name === id && candidate.properties.get("anchorType") === "plant-slot",
    );
    requireGardenMapInvariant(anchor !== undefined, `${id} anchor missing`);

    return Object.freeze({
      id,
      interactionX: getNumberProperty(anchor.properties, "interactionX"),
      interactionY: getNumberProperty(anchor.properties, "interactionY"),
      x: anchor.x,
      y: anchor.y,
      zoneId: getZoneIdProperty(anchor.properties, "zoneId"),
    });
  }),
);

const MAIN_WALKABLE_AREA = Object.freeze({
  x: 0,
  y: 0,
  width: GARDEN_MAP_WIDTH,
  height: GARDEN_MAP_HEIGHT,
});

export const GARDEN_MAP_CONFIG: GardenMapConfig = Object.freeze({
  collisionGridPositions: getLayerGridPositions("Collision"),
  companionPosition: getAnchor("companion"),
  height: TILED_GARDEN_MAP_DATA.height * TILED_GARDEN_MAP_DATA.tileheight,
  pathGridPositions: getLayerGridPositions("Path"),
  plantSlots: PLANT_SLOT_CONFIGS,
  playerSpawn: getAnchor("player-spawn"),
  tileSize: TILED_GARDEN_MAP_DATA.tilewidth,
  walkableAreas: Object.freeze([MAIN_WALKABLE_AREA]),
  waterGridPositions: getLayerGridPositions("Water"),
  width: TILED_GARDEN_MAP_DATA.width * TILED_GARDEN_MAP_DATA.tilewidth,
});
