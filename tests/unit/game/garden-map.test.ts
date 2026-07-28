import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { PLANT_SLOT_IDS } from "../../../domain/plants/plant-slots";
import {
  GARDEN_MAP_COLUMNS,
  GARDEN_MAP_CONFIG,
  GARDEN_MAP_HEIGHT,
  GARDEN_MAP_ROWS,
  GARDEN_MAP_TILE_SIZE,
  GARDEN_MAP_WIDTH,
  MINIMUM_PLANT_SLOT_DISTANCE,
  PLANT_SLOT_CONFIGS,
} from "../../../game/config/garden-map";
import {
  GARDEN_BASE_OVERLAY_ASSET,
  GARDEN_GROWTH_OVERLAY_ASSETS,
  GARDEN_PIXEL_RENDER_CONFIG,
  GARDEN_TILEMAP_ASSET_PATH,
  GARDEN_TILESET_ASSETS,
} from "../../../game/config/game-config";
import {
  GARDEN_ZONE_CONFIGS,
  GARDEN_ZONE_IDS,
  getGardenZoneIdForSlot,
} from "../../../game/config/garden-zones";
import {
  GARDEN_GROWTH_LAYER_NAMES,
  GLOBAL_GARDEN_GROWTH_LAYER_NAMES,
  type GardenTileLayerName,
  getGardenTileLayer,
  REQUIRED_GARDEN_TILE_LAYER_NAMES,
  TILED_GARDEN_MAP_DATA,
  validateTiledGardenMapData,
} from "../../../game/config/tiled-garden-map";

function gridKeyFromWorld(x: number, y: number): string {
  return `${Math.floor(x / GARDEN_MAP_TILE_SIZE)},${Math.floor(y / GARDEN_MAP_TILE_SIZE)}`;
}

function gridKey(column: number, row: number): string {
  return `${column},${row}`;
}

function readPngDimensions(path: string): Readonly<{ height: number; width: number }> {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function readPngRgba(path: string): Promise<
  Readonly<{
    data: Buffer;
    height: number;
    width: number;
  }>
> {
  const result = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  expect(result.info.channels).toBe(4);

  return {
    data: result.data,
    height: result.info.height,
    width: result.info.width,
  };
}

function resolvePublicAssetPath(path: string): string {
  return resolve(process.cwd(), "public", path.replace(/^\//, ""));
}

function getTilesetRange(name: string): Readonly<{ firstGid: number; lastGid: number }> {
  const tileset = TILED_GARDEN_MAP_DATA.tilesets.find((candidate) => candidate.name === name);

  expect(tileset, name).toBeDefined();

  if (tileset === undefined) {
    return { firstGid: 0, lastGid: -1 };
  }

  return {
    firstGid: tileset.firstgid,
    lastGid: tileset.firstgid + tileset.tilecount - 1,
  };
}

function isGidInRange(
  gid: number,
  range: Readonly<{ firstGid: number; lastGid: number }>,
): boolean {
  return gid >= range.firstGid && gid <= range.lastGid;
}

describe("pixel garden map resources", () => {
  it("uses a valid 30 by 20 Tiled map with the required layers", () => {
    expect(() => validateTiledGardenMapData()).not.toThrow();
    expect(TILED_GARDEN_MAP_DATA).toMatchObject({
      height: 20,
      orientation: "orthogonal",
      tileheight: 32,
      tilewidth: 32,
      type: "map",
      width: 30,
    });

    for (const layerName of REQUIRED_GARDEN_TILE_LAYER_NAMES) {
      const layer = getGardenTileLayer(layerName);
      expect(layer.data, layerName).toHaveLength(GARDEN_MAP_COLUMNS * GARDEN_MAP_ROWS);
    }

    expect(getGardenTileLayer("Collision").data.some((gid) => gid !== 0)).toBe(true);
  });

  it("ships every referenced minimal tileset with matching PNG dimensions", () => {
    for (const tileset of TILED_GARDEN_MAP_DATA.tilesets) {
      const path = resolve(process.cwd(), "public/assets/garden/maps", tileset.image);

      expect(existsSync(path), tileset.name).toBe(true);
      expect(readPngDimensions(path), tileset.name).toEqual({
        width: tileset.imagewidth,
        height: tileset.imageheight,
      });
      expect(tileset.tilewidth, tileset.name).toBe(GARDEN_MAP_TILE_SIZE);
      expect([GARDEN_MAP_TILE_SIZE, GARDEN_MAP_TILE_SIZE * 2], tileset.name).toContain(
        tileset.tileheight,
      );
    }
  });

  it("ships every progressive layer hidden until the runtime applies garden growth", () => {
    for (const layerName of GARDEN_GROWTH_LAYER_NAMES) {
      expect(getGardenTileLayer(layerName).visible, layerName).toBe(false);
    }
  });

  it("ships one full-map base overlay and four ordered growth overlays", () => {
    const assets = [GARDEN_BASE_OVERLAY_ASSET, ...GARDEN_GROWTH_OVERLAY_ASSETS];

    expect(GARDEN_GROWTH_OVERLAY_ASSETS.map((asset) => asset.layerName)).toEqual(
      GLOBAL_GARDEN_GROWTH_LAYER_NAMES,
    );
    expect(new Set(assets.map((asset) => asset.key)).size).toBe(assets.length);
    expect(new Set(assets.map((asset) => asset.path)).size).toBe(assets.length);

    for (const asset of assets) {
      const path = resolvePublicAssetPath(asset.path);

      expect(existsSync(path), asset.key).toBe(true);
      expect(readPngDimensions(path), asset.key).toEqual({
        height: GARDEN_MAP_HEIGHT,
        width: GARDEN_MAP_WIDTH,
      });
    }
  });

  it("does not ship or reference the rejected mature crop environment atlas", () => {
    expect(existsSync(resolve(process.cwd(), "public/assets/garden/decor/garden-growth.png"))).toBe(
      false,
    );
    expect(existsSync(resolve(process.cwd(), "public/assets/garden/tiles/garden-bed.png"))).toBe(
      false,
    );
    expect(
      TILED_GARDEN_MAP_DATA.tilesets.some((tileset) =>
        ["garden-growth", "garden-bed"].includes(tileset.name),
      ),
    ).toBe(false);
    expect(
      GARDEN_TILESET_ASSETS.some((asset) =>
        ["garden-growth", "garden-bed"].includes(asset.tiledName),
      ),
    ).toBe(false);

    const assetScript = readFileSync(
      resolve(process.cwd(), "scripts/build-garden-map-assets.ps1"),
      "utf8",
    );
    const mapScript = readFileSync(resolve(process.cwd(), "scripts/build-garden-map.mjs"), "utf8");

    expect(assetScript).not.toContain("TileSheets\\crops..png");
    expect(mapScript).not.toContain("TILESETS.growth");

    for (const rejectedCrop of [
      "224 192 16 32",
      "224 224 16 32",
      "80 480 16 32",
      "224 320 16 32",
      "208 608 16 32",
      "96 256 16 32",
      "224 576 16 32",
      "96 640 16 32",
    ]) {
      expect(assetScript, rejectedCrop).not.toContain(rejectedCrop);
    }
  });

  it("fills the same full-map flowerbeds monotonically instead of adding crop sprites", async () => {
    const assets = [GARDEN_BASE_OVERLAY_ASSET, ...GARDEN_GROWTH_OVERLAY_ASSETS];
    const cumulativeMask = new Uint8Array(GARDEN_MAP_WIDTH * GARDEN_MAP_HEIGHT);
    const coverage: number[] = [];

    for (const asset of assets) {
      const image = await readPngRgba(resolvePublicAssetPath(asset.path));

      for (let pixel = 0; pixel < cumulativeMask.length; pixel += 1) {
        const alpha = image.data[pixel * 4 + 3] ?? 0;

        if (alpha > 0) {
          cumulativeMask[pixel] = 1;
        }
      }

      coverage.push(cumulativeMask.reduce((sum, value) => sum + value, 0));
    }

    expect(coverage[0]).toBeGreaterThan(0);

    for (let stage = 1; stage < coverage.length; stage += 1) {
      expect(coverage[stage], `stage ${stage}`).toBeGreaterThan(coverage[stage - 1] ?? 0);
    }

    expect((coverage[2] ?? 0) / (coverage[4] ?? 1)).toBeGreaterThanOrEqual(0.55);
  });

  it("keeps progressive decor away from paths, interactions, anchors, and plant bodies", () => {
    const allPresentationLayers: GardenTileLayerName[] = [
      "BaseLow",
      "BaseMedium",
      ...GARDEN_GROWTH_LAYER_NAMES,
    ];
    const protectedLowCells = new Set(
      GARDEN_MAP_CONFIG.pathGridPositions.map((position) => gridKey(position.column, position.row)),
    );

    for (const position of GARDEN_MAP_CONFIG.waterGridPositions) {
      protectedLowCells.add(gridKey(position.column, position.row));
    }

    protectedLowCells.add(
      gridKeyFromWorld(GARDEN_MAP_CONFIG.playerSpawn.x, GARDEN_MAP_CONFIG.playerSpawn.y),
    );
    protectedLowCells.add(
      gridKeyFromWorld(
        GARDEN_MAP_CONFIG.companionPosition.x,
        GARDEN_MAP_CONFIG.companionPosition.y,
      ),
    );

    for (const slot of PLANT_SLOT_CONFIGS) {
      protectedLowCells.add(gridKeyFromWorld(slot.interactionX, slot.interactionY));
    }

    const protectedMediumCells = new Set(protectedLowCells);

    for (const slot of PLANT_SLOT_CONFIGS) {
      protectedMediumCells.add(gridKeyFromWorld(slot.x, slot.y));
    }

    const lowDecorRanges = [
      getTilesetRange("garden-flowerbeds"),
      getTilesetRange("garden-ground-details"),
      getTilesetRange("garden-hedges"),
      getTilesetRange("garden-vines"),
    ];
    const mediumDecorRanges = [getTilesetRange("garden-hedges"), getTilesetRange("garden-vines")];
    let mediumDecorCount = 0;

    for (const layerName of allPresentationLayers) {
      getGardenTileLayer(layerName).data.forEach((gid, index) => {
        const cellKey = gridKey(index % GARDEN_MAP_COLUMNS, Math.floor(index / GARDEN_MAP_COLUMNS));

        if (lowDecorRanges.some((range) => isGidInRange(gid, range))) {
          expect(protectedLowCells.has(cellKey), `${layerName} ${cellKey}`).toBe(false);
        }

        if (mediumDecorRanges.some((range) => isGidInRange(gid, range))) {
          mediumDecorCount += 1;
          expect(protectedMediumCells.has(cellKey), `${layerName} ${cellKey}`).toBe(false);
        }
      });
    }

    expect(mediumDecorCount).toBeGreaterThan(0);
    expect(mediumDecorCount).toBeLessThanOrEqual(
      Math.floor(GARDEN_MAP_COLUMNS * GARDEN_MAP_ROWS * 0.1),
    );

    const beds = getGardenTileLayer("Beds");
    const fixedBedExclusions = new Set([
      ...GARDEN_MAP_CONFIG.pathGridPositions.map((position) =>
        gridKey(position.column, position.row),
      ),
      ...GARDEN_MAP_CONFIG.waterGridPositions.map((position) =>
        gridKey(position.column, position.row),
      ),
      ...GARDEN_MAP_CONFIG.collisionGridPositions.map((position) =>
        gridKey(position.column, position.row),
      ),
    ]);

    beds.data.forEach((gid, index) => {
      if (gid === 0) {
        return;
      }

      const cellKey = gridKey(index % GARDEN_MAP_COLUMNS, Math.floor(index / GARDEN_MAP_COLUMNS));
      expect(fixedBedExclusions.has(cellKey), `Beds ${cellKey}`).toBe(false);
    });

    const flowerbedRange = getTilesetRange("garden-flowerbeds");

    for (const layerName of ["GlobalGrowth1Low", "GlobalGrowth2Low"] as const) {
      const gids = getGardenTileLayer(layerName).data.filter((gid) => gid !== 0);
      expect(gids.length, layerName).toBeGreaterThan(0);
      expect(
        gids.every((gid) => isGidInRange(gid, flowerbedRange)),
        layerName,
      ).toBe(true);
    }
  });

  it("keeps every full-map overlay transparent across navigation and interaction safety areas", async () => {
    const assets = [GARDEN_BASE_OVERLAY_ASSET, ...GARDEN_GROWTH_OVERLAY_ASSETS];
    const protectedCellLayers = ["Path", "Water", "BaseMedium", "BaseAbove", "Collision"] as const;
    const protectedCellIndices = new Set<number>();

    for (const layerName of protectedCellLayers) {
      getGardenTileLayer(layerName).data.forEach((gid, index) => {
        if (gid !== 0) {
          protectedCellIndices.add(index);
        }
      });
    }

    const protectedPoints = [
      GARDEN_MAP_CONFIG.playerSpawn,
      GARDEN_MAP_CONFIG.companionPosition,
      ...PLANT_SLOT_CONFIGS.map((slot) => ({
        x: slot.interactionX,
        y: slot.interactionY,
      })),
    ];

    for (const asset of assets) {
      const image = await readPngRgba(resolvePublicAssetPath(asset.path));
      let protectedPixelCount = 0;

      for (const index of protectedCellIndices) {
        const startX = (index % GARDEN_MAP_COLUMNS) * GARDEN_MAP_TILE_SIZE;
        const startY = Math.floor(index / GARDEN_MAP_COLUMNS) * GARDEN_MAP_TILE_SIZE;

        for (let y = startY; y < startY + GARDEN_MAP_TILE_SIZE; y += 1) {
          for (let x = startX; x < startX + GARDEN_MAP_TILE_SIZE; x += 1) {
            if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) {
              protectedPixelCount += 1;
            }
          }
        }
      }

      for (const point of protectedPoints) {
        for (let y = point.y - 10; y < point.y + 10; y += 1) {
          for (let x = point.x - 10; x < point.x + 10; x += 1) {
            if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) {
              protectedPixelCount += 1;
            }
          }
        }
      }

      expect(protectedPixelCount, asset.key).toBe(0);
    }
  });

  it("uses crisp pixel rendering in Phaser and the Canvas stylesheet", () => {
    expect(GARDEN_PIXEL_RENDER_CONFIG).toEqual({
      antialias: false,
      pixelArt: true,
      roundPixels: true,
    });
    expect(GARDEN_TILEMAP_ASSET_PATH).toBe("/assets/garden/maps/garden-map.json");
    expect(GARDEN_TILESET_ASSETS).toHaveLength(TILED_GARDEN_MAP_DATA.tilesets.length);

    const stylesheet = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    expect(stylesheet).toContain(".pixel-garden-canvas canvas");
    expect(stylesheet).toContain("image-rendering: pixelated");
  });
});

describe("GARDEN_MAP_CONFIG", () => {
  it("keeps the 960 by 640 world and 32 pixel navigation grid", () => {
    expect(GARDEN_MAP_CONFIG).toMatchObject({
      width: 960,
      height: 640,
      tileSize: 32,
    });
    expect(GARDEN_MAP_WIDTH).toBe(960);
    expect(GARDEN_MAP_HEIGHT).toBe(640);
    expect(GARDEN_MAP_COLUMNS).toBe(30);
    expect(GARDEN_MAP_ROWS).toBe(20);
    expect(GARDEN_MAP_CONFIG.collisionGridPositions.length).toBeGreaterThan(0);
    expect(GARDEN_MAP_CONFIG.pathGridPositions.length).toBeGreaterThan(0);
    expect(GARDEN_MAP_CONFIG.waterGridPositions.length).toBeGreaterThan(0);
  });

  it("contains every stable plant slot exactly once", () => {
    const configuredIds = PLANT_SLOT_CONFIGS.map((slot) => slot.id);

    expect(configuredIds).toHaveLength(36);
    expect(new Set(configuredIds).size).toBe(36);
    expect(configuredIds).toEqual(PLANT_SLOT_IDS);
    expect(GARDEN_MAP_CONFIG.plantSlots).toBe(PLANT_SLOT_CONFIGS);
  });

  it("assigns every stable slot to exactly one of six garden zones", () => {
    expect(GARDEN_ZONE_CONFIGS).toHaveLength(6);
    expect(GARDEN_ZONE_CONFIGS.map((zone) => zone.id)).toEqual(GARDEN_ZONE_IDS);

    const zoneSlotIds = GARDEN_ZONE_CONFIGS.flatMap((zone) => {
      expect(zone.slotIds, zone.id).toHaveLength(6);
      return zone.slotIds;
    });

    expect(zoneSlotIds).toHaveLength(36);
    expect(new Set(zoneSlotIds).size).toBe(36);
    expect(zoneSlotIds).toEqual(PLANT_SLOT_IDS);

    for (const slot of PLANT_SLOT_CONFIGS) {
      expect(slot.zoneId, slot.id).toBe(getGardenZoneIdForSlot(slot.id));
    }
  });

  it("keeps slots centered, inside the map, and outside paths, water, and fixed collisions", () => {
    const pathKeys = new Set(
      GARDEN_MAP_CONFIG.pathGridPositions.map((position) => gridKey(position.column, position.row)),
    );
    const waterKeys = new Set(
      GARDEN_MAP_CONFIG.waterGridPositions.map((position) =>
        gridKey(position.column, position.row),
      ),
    );
    const collisionKeys = new Set(
      GARDEN_MAP_CONFIG.collisionGridPositions.map((position) =>
        gridKey(position.column, position.row),
      ),
    );

    for (const slot of PLANT_SLOT_CONFIGS) {
      const slotKey = gridKeyFromWorld(slot.x, slot.y);

      expect(slot.x, `${slot.id} x`).toBeGreaterThan(0);
      expect(slot.x, `${slot.id} x`).toBeLessThan(GARDEN_MAP_WIDTH);
      expect(slot.y, `${slot.id} y`).toBeGreaterThan(0);
      expect(slot.y, `${slot.id} y`).toBeLessThan(GARDEN_MAP_HEIGHT);
      expect((slot.x - GARDEN_MAP_TILE_SIZE / 2) % GARDEN_MAP_TILE_SIZE).toBe(0);
      expect((slot.y - GARDEN_MAP_TILE_SIZE / 2) % GARDEN_MAP_TILE_SIZE).toBe(0);
      expect(pathKeys.has(slotKey), `${slot.id} path overlap`).toBe(false);
      expect(waterKeys.has(slotKey), `${slot.id} water overlap`).toBe(false);
      expect(collisionKeys.has(slotKey), `${slot.id} collision overlap`).toBe(false);
    }
  });

  it("keeps every pair of plant slots at least 64 pixels apart", () => {
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

        expect(
          Math.hypot(left.x - right.x, left.y - right.y),
          `${left.id}/${right.id}`,
        ).toBeGreaterThanOrEqual(MINIMUM_PLANT_SLOT_DISTANCE);
      }
    }
  });
});
