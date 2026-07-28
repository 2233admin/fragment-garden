import gardenMapJson from "../../public/assets/garden/maps/garden-map.json";

import { GARDEN_ZONE_IDS } from "./garden-zones";

export const BASE_GARDEN_RENDER_LAYER_NAMES = Object.freeze([
  "Ground",
  "Beds",
  "Path",
  "Water",
  "BaseLow",
  "BaseMedium",
  "BaseAbove",
] as const);

export const GLOBAL_GARDEN_GROWTH_LAYER_NAMES = Object.freeze([
  "GlobalGrowth1Low",
  "GlobalGrowth2Low",
  "GlobalGrowth3Medium",
  "GlobalGrowth4Above",
] as const);

export const ZONE_GARDEN_GROWTH_LAYER_NAMES = Object.freeze(
  GARDEN_ZONE_IDS.flatMap((zoneId) =>
    ([1, 2, 3] as const).map((level) => `Zone_${zoneId}_Growth${level}` as const),
  ),
);

export const GARDEN_GROWTH_LAYER_NAMES = Object.freeze([
  ...GLOBAL_GARDEN_GROWTH_LAYER_NAMES,
  ...ZONE_GARDEN_GROWTH_LAYER_NAMES,
]);

export const GARDEN_RENDER_TILE_LAYER_NAMES = Object.freeze([
  ...BASE_GARDEN_RENDER_LAYER_NAMES,
  ...GARDEN_GROWTH_LAYER_NAMES,
]);

export const REQUIRED_GARDEN_TILE_LAYER_NAMES = Object.freeze([
  ...GARDEN_RENDER_TILE_LAYER_NAMES,
  "Collision",
]);

export type GardenTileLayerName = (typeof REQUIRED_GARDEN_TILE_LAYER_NAMES)[number];
export type GardenGrowthLayerName = (typeof GARDEN_GROWTH_LAYER_NAMES)[number];

type TiledProperty = Readonly<{
  name: string;
  value: unknown;
}>;

type TiledTileLayer = Readonly<{
  data: readonly number[];
  height: number;
  name: string;
  type: "tilelayer";
  visible?: boolean;
  width: number;
}>;

type TiledObject = Readonly<{
  name: string;
  properties?: readonly TiledProperty[];
  type: string;
  x: number;
  y: number;
}>;

type TiledObjectLayer = Readonly<{
  name: string;
  objects: readonly TiledObject[];
  type: "objectgroup";
}>;

type TiledLayer = TiledTileLayer | TiledObjectLayer;

export type TiledGardenMapData = Readonly<{
  height: number;
  layers: readonly TiledLayer[];
  orientation: string;
  tileheight: number;
  tilesets: readonly Readonly<{
    firstgid: number;
    image: string;
    imageheight: number;
    imagewidth: number;
    name: string;
    tilecount: number;
    tileheight: number;
    tilewidth: number;
  }>[];
  tilewidth: number;
  type: string;
  width: number;
}>;

export type GardenMapAnchor = Readonly<{
  name: string;
  properties: ReadonlyMap<string, unknown>;
  type: string;
  x: number;
  y: number;
}>;

export const TILED_GARDEN_MAP_DATA = gardenMapJson as unknown as TiledGardenMapData;

function requireMapInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid pixel garden map: ${message}`);
  }
}

export function getGardenTileLayer(name: GardenTileLayerName): TiledTileLayer {
  const layer = TILED_GARDEN_MAP_DATA.layers.find(
    (candidate): candidate is TiledTileLayer =>
      candidate.type === "tilelayer" && candidate.name === name,
  );

  requireMapInvariant(layer !== undefined, `missing ${name} tile layer`);
  requireMapInvariant(
    layer.width === TILED_GARDEN_MAP_DATA.width && layer.height === TILED_GARDEN_MAP_DATA.height,
    `${name} dimensions do not match the map`,
  );
  requireMapInvariant(
    layer.data.length === layer.width * layer.height,
    `${name} data length does not match its dimensions`,
  );

  return layer;
}

export function getGardenMapAnchors(): readonly GardenMapAnchor[] {
  const layer = TILED_GARDEN_MAP_DATA.layers.find(
    (candidate): candidate is TiledObjectLayer =>
      candidate.type === "objectgroup" && candidate.name === "Anchors",
  );

  requireMapInvariant(layer !== undefined, "missing Anchors object layer");

  return Object.freeze(
    layer.objects.map((object) =>
      Object.freeze({
        name: object.name,
        properties: new Map(
          (object.properties ?? []).map((property) => [property.name, property.value] as const),
        ),
        type: object.type,
        x: object.x,
        y: object.y,
      }),
    ),
  );
}

export function validateTiledGardenMapData(): void {
  requireMapInvariant(TILED_GARDEN_MAP_DATA.type === "map", "root type must be map");
  requireMapInvariant(
    TILED_GARDEN_MAP_DATA.orientation === "orthogonal",
    "orientation must be orthogonal",
  );
  requireMapInvariant(
    TILED_GARDEN_MAP_DATA.width === 30 && TILED_GARDEN_MAP_DATA.height === 20,
    "map must be 30 by 20 tiles",
  );
  requireMapInvariant(
    TILED_GARDEN_MAP_DATA.tilewidth === 32 && TILED_GARDEN_MAP_DATA.tileheight === 32,
    "runtime tiles must be 32 by 32 pixels",
  );

  for (const layerName of REQUIRED_GARDEN_TILE_LAYER_NAMES) {
    getGardenTileLayer(layerName);
  }

  const anchors = getGardenMapAnchors();
  requireMapInvariant(
    anchors.some((anchor) => anchor.properties.get("anchorType") === "player-spawn"),
    "missing player spawn anchor",
  );
  requireMapInvariant(
    anchors.some((anchor) => anchor.properties.get("anchorType") === "companion"),
    "missing companion anchor",
  );
}
