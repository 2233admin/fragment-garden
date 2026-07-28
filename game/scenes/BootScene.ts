import * as Phaser from "phaser";

import {
  CONTENT_PLANT_ASSET,
  CONTENT_PLANT_FALLBACK_SHADOW_TEXTURE_KEY,
  CONTENT_PLANT_SHADOW_ASSET,
} from "../config/content-plant-species";
import {
  COMPANION_CHARACTER_ASSETS,
  COMPANION_IDLE_FRAME_RATE,
  COMPANION_IDLE_FRAMES,
  GARDEN_ENTITY_SHADOW_ASSET,
  PLAYER_CHARACTER_ASSET,
  PLAYER_WALK_FRAME_RATE,
  resolveCompanionIdleAnimationKey,
  resolvePlayerWalkAnimationKey,
  resolvePlayerWalkFrames,
  type PlayerDirection,
} from "../config/garden-character-animations";
import {
  BOOT_SCENE_KEY,
  GARDEN_BASE_OVERLAY_ASSET,
  GARDEN_GROWTH_OVERLAY_ASSETS,
  GARDEN_MAP_LOAD_FAILED_REGISTRY_KEY,
  GARDEN_RENDER_COLORS,
  GARDEN_SCENE_KEY,
  GARDEN_TILEMAP_ASSET_PATH,
  GARDEN_TILEMAP_KEY,
  GARDEN_TILESET_ASSETS,
  PLANT_TEXTURE_KEYS,
  PLAYER_TEXTURE_KEY,
} from "../config/game-config";

type RuntimeFailureHandler = (kind: "initialize" | "update") => void;

const PLANT_TEXTURE_SIZE = 72;
const CONTENT_PLANT_ASSET_KEYS = new Set<string>([
  CONTENT_PLANT_ASSET.key,
  CONTENT_PLANT_SHADOW_ASSET.key,
]);
const OPTIONAL_CHARACTER_ASSET_KEYS = new Set<string>([
  PLAYER_CHARACTER_ASSET.key,
  GARDEN_ENTITY_SHADOW_ASSET.key,
  ...Object.values(COMPANION_CHARACTER_ASSETS).map((asset) => asset.key),
]);
const PLAYER_DIRECTIONS: readonly PlayerDirection[] = ["down", "up", "left", "right"];

export class BootScene extends Phaser.Scene {
  private hasGardenAssetLoadFailed = false;

  constructor(private readonly onFailure: RuntimeFailureHandler) {
    super(BOOT_SCENE_KEY);
  }

  preload(): void {
    this.hasGardenAssetLoadFailed = false;
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleGardenAssetLoadError, this);
    this.load.tilemapTiledJSON(GARDEN_TILEMAP_KEY, GARDEN_TILEMAP_ASSET_PATH);

    for (const asset of GARDEN_TILESET_ASSETS) {
      this.load.image(asset.key, asset.path);
    }

    this.load.image(GARDEN_BASE_OVERLAY_ASSET.key, GARDEN_BASE_OVERLAY_ASSET.path);

    for (const asset of GARDEN_GROWTH_OVERLAY_ASSETS) {
      this.load.image(asset.key, asset.path);
    }

    this.load.spritesheet(CONTENT_PLANT_ASSET.key, CONTENT_PLANT_ASSET.path, {
      frameWidth: CONTENT_PLANT_ASSET.frameWidth,
      frameHeight: CONTENT_PLANT_ASSET.frameHeight,
    });
    this.load.image(CONTENT_PLANT_SHADOW_ASSET.key, CONTENT_PLANT_SHADOW_ASSET.path);
    this.load.spritesheet(PLAYER_CHARACTER_ASSET.key, PLAYER_CHARACTER_ASSET.path, {
      frameWidth: PLAYER_CHARACTER_ASSET.frameWidth,
      frameHeight: PLAYER_CHARACTER_ASSET.frameHeight,
    });

    for (const companionAsset of Object.values(COMPANION_CHARACTER_ASSETS)) {
      this.load.spritesheet(companionAsset.key, companionAsset.path, {
        frameWidth: companionAsset.frameWidth,
        frameHeight: companionAsset.frameHeight,
      });
    }

    this.load.image(GARDEN_ENTITY_SHADOW_ASSET.key, GARDEN_ENTITY_SHADOW_ASSET.path);
  }

  create(): void {
    try {
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleGardenAssetLoadError, this);
      this.registry.set(GARDEN_MAP_LOAD_FAILED_REGISTRY_KEY, this.hasGardenAssetLoadFailed);
      this.createPlayerTexture();
      this.createPlantTextures();
      this.createContentPlantFallbackShadow();
      this.createGardenCharacterAnimations();
      this.scene.start(GARDEN_SCENE_KEY);
    } catch {
      this.onFailure("initialize");
    }
  }

  private handleGardenAssetLoadError(file: { key?: string }): void {
    if (
      typeof file.key === "string" &&
      (CONTENT_PLANT_ASSET_KEYS.has(file.key) || OPTIONAL_CHARACTER_ASSET_KEYS.has(file.key))
    ) {
      return;
    }

    this.hasGardenAssetLoadFailed = true;
  }

  private createContentPlantFallbackShadow(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);

    graphics.fillStyle(0x243626, 0.22);
    graphics.fillEllipse(24, 8, 36, 10);
    graphics.generateTexture(CONTENT_PLANT_FALLBACK_SHADOW_TEXTURE_KEY, 48, 16);
    graphics.destroy();
  }

  private createPlayerTexture(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);

    graphics.lineStyle(2, GARDEN_RENDER_COLORS.playerOutline, 1);
    graphics.fillStyle(GARDEN_RENDER_COLORS.playerClothing, 1);
    graphics.fillRoundedRect(9, 23, 24, 28, 8);
    graphics.strokeRoundedRect(9, 23, 24, 28, 8);
    graphics.fillStyle(GARDEN_RENDER_COLORS.playerSkin, 1);
    graphics.fillCircle(21, 14, 10);
    graphics.strokeCircle(21, 14, 10);
    graphics.generateTexture(PLAYER_TEXTURE_KEY, 42, 54);
    graphics.destroy();
  }

  private createPlantTextures(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);

    this.drawSeedling(graphics);
    graphics.generateTexture(PLANT_TEXTURE_KEYS.seedling, PLANT_TEXTURE_SIZE, PLANT_TEXTURE_SIZE);
    graphics.clear();

    this.drawGrowingPlant(graphics);
    graphics.generateTexture(PLANT_TEXTURE_KEYS.growing, PLANT_TEXTURE_SIZE, PLANT_TEXTURE_SIZE);
    graphics.clear();

    this.drawBuddingPlant(graphics);
    graphics.generateTexture(PLANT_TEXTURE_KEYS.budding, PLANT_TEXTURE_SIZE, PLANT_TEXTURE_SIZE);
    graphics.clear();

    this.drawBloomingPlant(graphics, GARDEN_RENDER_COLORS.bloom, false);
    graphics.generateTexture(PLANT_TEXTURE_KEYS.blooming, PLANT_TEXTURE_SIZE, PLANT_TEXTURE_SIZE);
    graphics.clear();

    this.drawBloomingPlant(graphics, GARDEN_RENDER_COLORS.permanentBloom, true);
    graphics.generateTexture(
      PLANT_TEXTURE_KEYS.permanent_bloom,
      PLANT_TEXTURE_SIZE,
      PLANT_TEXTURE_SIZE,
    );
    graphics.destroy();
  }

  private createGardenCharacterAnimations(): void {
    if (this.textures.exists(PLAYER_CHARACTER_ASSET.key)) {
      for (const direction of PLAYER_DIRECTIONS) {
        const key = resolvePlayerWalkAnimationKey(direction);

        if (this.anims.exists(key)) {
          continue;
        }

        this.anims.create({
          key,
          frames: resolvePlayerWalkFrames(direction).map((frame) => ({
            frame,
            key: PLAYER_CHARACTER_ASSET.key,
          })),
          frameRate: PLAYER_WALK_FRAME_RATE,
          repeat: -1,
        });
      }
    }

    for (const [type, asset] of Object.entries(COMPANION_CHARACTER_ASSETS)) {
      if (!this.textures.exists(asset.key)) {
        continue;
      }

      const key = resolveCompanionIdleAnimationKey(type as "cat" | "dog");

      if (this.anims.exists(key)) {
        continue;
      }

      this.anims.create({
        key,
        frames: COMPANION_IDLE_FRAMES.map((frame) => ({
          frame,
          key: asset.key,
        })),
        frameRate: COMPANION_IDLE_FRAME_RATE,
        repeat: -1,
      });
    }
  }

  private drawSeedling(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(GARDEN_RENDER_COLORS.stem, 1);
    graphics.fillRect(34, 39, 4, 27);
    graphics.fillStyle(GARDEN_RENDER_COLORS.leaf, 1);
    graphics.fillEllipse(27, 44, 17, 9);
    graphics.fillEllipse(44, 37, 16, 9);
  }

  private drawGrowingPlant(graphics: Phaser.GameObjects.Graphics): void {
    graphics.fillStyle(GARDEN_RENDER_COLORS.stem, 1);
    graphics.fillRect(34, 25, 4, 41);
    graphics.fillStyle(GARDEN_RENDER_COLORS.leaf, 1);
    graphics.fillEllipse(25, 49, 22, 11);
    graphics.fillEllipse(47, 40, 22, 11);
    graphics.fillStyle(GARDEN_RENDER_COLORS.leafShade, 1);
    graphics.fillEllipse(27, 31, 18, 9);
  }

  private drawBuddingPlant(graphics: Phaser.GameObjects.Graphics): void {
    this.drawGrowingPlant(graphics);
    graphics.fillStyle(GARDEN_RENDER_COLORS.bud, 1);
    graphics.fillCircle(36, 21, 8);
    graphics.fillStyle(GARDEN_RENDER_COLORS.leafShade, 1);
    graphics.fillTriangle(28, 22, 36, 10, 44, 22);
  }

  private drawBloomingPlant(
    graphics: Phaser.GameObjects.Graphics,
    flowerColor: number,
    hasPermanentRing: boolean,
  ): void {
    this.drawGrowingPlant(graphics);

    if (hasPermanentRing) {
      graphics.lineStyle(3, GARDEN_RENDER_COLORS.permanentBloom, 0.72);
      graphics.strokeCircle(36, 21, 19);
    }

    graphics.fillStyle(flowerColor, 1);
    graphics.fillCircle(36, 10, 8);
    graphics.fillCircle(47, 20, 8);
    graphics.fillCircle(36, 30, 8);
    graphics.fillCircle(25, 20, 8);
    graphics.fillStyle(GARDEN_RENDER_COLORS.bud, 1);
    graphics.fillCircle(36, 20, 6);
  }
}
