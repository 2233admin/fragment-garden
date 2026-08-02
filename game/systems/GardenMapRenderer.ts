import * as Phaser from "phaser";

import type { GardenMapConfig } from "../config/garden-map";
import {
  GARDEN_BASE_OVERLAY_ASSET,
  GARDEN_GROWTH_OVERLAY_ASSETS,
  GARDEN_MAP_LOAD_FAILED_REGISTRY_KEY,
  GARDEN_RENDER_COLORS,
  GARDEN_TILEMAP_KEY,
  GARDEN_TILESET_ASSETS,
} from "../config/game-config";
import {
  GARDEN_GROWTH_LAYER_NAMES,
  GARDEN_RENDER_TILE_LAYER_NAMES,
  type GardenGrowthLayerName,
} from "../config/tiled-garden-map";
import type { GardenGrowthLayerController } from "./GardenGrowthSystem";

export type GardenMapRenderMode = "pixel" | "fallback";

export type GardenMapRenderResult = Readonly<{
  growthLayers: ReadonlyMap<GardenGrowthLayerName, GardenGrowthLayerController>;
  mode: GardenMapRenderMode;
}>;

const GROWTH_LAYER_NAMES = new Set<string>(GARDEN_GROWTH_LAYER_NAMES);

function getPixelLayerDepth(layerName: string): number {
  switch (layerName) {
    case "Ground":
      return -3_000;
    case "Beds":
      return -2_900;
    case "Path":
      return -2_800;
    case "Water":
      return -2_700;
    case "BaseLow":
    case "GlobalGrowth1Low":
    case "GlobalGrowth2Low":
      return -1_000;
    case "BaseMedium":
      return 800;
    case "GlobalGrowth3Medium":
      return -800;
    case "BaseAbove":
      return 4_000;
    case "GlobalGrowth4Above":
      return -700;
    default:
      return layerName.startsWith("Zone_") ? -900 : 0;
  }
}

class PixelGardenMapRenderer {
  constructor(private readonly scene: Phaser.Scene) {}

  render(): ReadonlyMap<GardenGrowthLayerName, GardenGrowthLayerController> {
    if (this.scene.registry.get(GARDEN_MAP_LOAD_FAILED_REGISTRY_KEY) === true) {
      throw new Error("garden map assets did not finish loading");
    }

    const tilemap = this.scene.make.tilemap({ key: GARDEN_TILEMAP_KEY });
    const tilesets = GARDEN_TILESET_ASSETS.map((asset) => {
      const tileset = tilemap.addTilesetImage(asset.tiledName, asset.key);

      if (tileset === null) {
        throw new Error(`tileset ${asset.tiledName} is unavailable`);
      }

      return tileset;
    });
    const growthLayers = new Map<GardenGrowthLayerName, GardenGrowthLayerController>();

    for (const layerName of GARDEN_RENDER_TILE_LAYER_NAMES) {
      const layer = tilemap.createLayer(layerName, tilesets);

      if (layer === null) {
        throw new Error(`tile layer ${layerName} is unavailable`);
      }

      layer.setDepth(getPixelLayerDepth(layerName));

      if (layerName === "Beds") {
        // The full-map overlays now paint the visible garden beds as coherent
        // shapes. Keep the Tiled bed layer as a layout/testing contract, but
        // do not render its hard 32px edge tiles over the softer composition.
        layer.setVisible(false);
      }

      if (GROWTH_LAYER_NAMES.has(layerName)) {
        layer.setVisible(false);
        growthLayers.set(layerName as GardenGrowthLayerName, layer);
      }
    }

    this.scene.add.image(0, 0, GARDEN_BASE_OVERLAY_ASSET.key).setOrigin(0, 0).setDepth(-950);

    GARDEN_GROWTH_OVERLAY_ASSETS.forEach((asset, index) => {
      const tileLayer = growthLayers.get(asset.layerName);
      const overlay = this.scene.add
        .image(0, 0, asset.key)
        .setOrigin(0, 0)
        .setDepth(-880 + index)
        .setVisible(false);

      growthLayers.set(asset.layerName, {
        setVisible: (isVisible: boolean) => {
          // The Tiled layers remain the stable data contract and fallback
          // source. The full-map low overlay provides coherent garden art
          // without repeating 32px flower icons.
          tileLayer?.setVisible(false);
          return overlay.setVisible(isVisible);
        },
      });
    });

    return growthLayers;
  }
}

class FallbackGardenMapRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: GardenMapConfig,
  ) {}

  render(): void {
    const graphics = this.scene.add.graphics();

    graphics.fillStyle(GARDEN_RENDER_COLORS.grass, 1);
    graphics.fillRect(0, 0, this.config.width, this.config.height);

    for (const position of this.config.pathGridPositions) {
      graphics.fillStyle(GARDEN_RENDER_COLORS.path, 1);
      graphics.fillRect(
        position.column * this.config.tileSize,
        position.row * this.config.tileSize,
        this.config.tileSize,
        this.config.tileSize,
      );
    }

    for (const position of this.config.waterGridPositions) {
      graphics.fillStyle(GARDEN_RENDER_COLORS.pond, 1);
      graphics.fillRect(
        position.column * this.config.tileSize,
        position.row * this.config.tileSize,
        this.config.tileSize,
        this.config.tileSize,
      );
    }

    graphics.lineStyle(4, GARDEN_RENDER_COLORS.border, 0.9);
    graphics.strokeRect(2, 2, this.config.width - 4, this.config.height - 4);
    graphics.setDepth(-3_000);
  }
}

export class GardenMapRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: GardenMapConfig,
  ) {}

  render(): GardenMapRenderResult {
    try {
      return Object.freeze({
        growthLayers: new PixelGardenMapRenderer(this.scene).render(),
        mode: "pixel" as const,
      });
    } catch {
      console.error("像素花园地图暂时无法载入，已切换到本地备用地图。");
      new FallbackGardenMapRenderer(this.scene, this.config).render();
      return Object.freeze({
        growthLayers: new Map<GardenGrowthLayerName, GardenGrowthLayerController>(),
        mode: "fallback" as const,
      });
    }
  }
}
