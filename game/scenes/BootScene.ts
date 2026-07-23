import * as Phaser from "phaser";

import {
  BOOT_SCENE_KEY,
  GARDEN_RENDER_COLORS,
  GARDEN_SCENE_KEY,
  PLANT_TEXTURE_KEYS,
  PLAYER_TEXTURE_KEY,
} from "../config/game-config";

type RuntimeFailureHandler = (kind: "initialize" | "update") => void;

const PLANT_TEXTURE_SIZE = 72;

export class BootScene extends Phaser.Scene {
  constructor(private readonly onFailure: RuntimeFailureHandler) {
    super(BOOT_SCENE_KEY);
  }

  create(): void {
    try {
      this.createPlayerTexture();
      this.createPlantTextures();
      this.scene.start(GARDEN_SCENE_KEY);
    } catch {
      this.onFailure("initialize");
    }
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
