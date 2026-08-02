import * as Phaser from "phaser";

import {
  GARDEN_ENTITY_SHADOW_ASSET,
  PLAYER_CHARACTER_ASSET,
  resolveGardenCharacterTextureSource,
  resolvePlayerDirection,
  resolvePlayerFrame,
  resolvePlayerWalkAnimationKey,
  type GardenCharacterTextureSource,
  type PlayerDirection,
} from "../config/garden-character-animations";
import { PLAYER_TEXTURE_KEY } from "../config/game-config";

const PLAYER_DEPTH_OFFSET = 1_000;

export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private direction: PlayerDirection = "down";
  private readonly shadow: Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse;
  private readonly textureSource: GardenCharacterTextureSource;
  private isMoving = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const textureSource = resolveGardenCharacterTextureSource(
      scene.textures.exists(PLAYER_CHARACTER_ASSET.key),
    );
    super(
      scene,
      x,
      y,
      textureSource === "formal" ? PLAYER_CHARACTER_ASSET.key : PLAYER_TEXTURE_KEY,
      textureSource === "formal" ? resolvePlayerFrame("down") : undefined,
    );

    this.textureSource = textureSource;
    this.shadow = scene.textures.exists(GARDEN_ENTITY_SHADOW_ASSET.key)
      ? scene.add
          .image(x, y + 2, GARDEN_ENTITY_SHADOW_ASSET.key)
          .setAlpha(0.18)
          .setScale(0.72, 1)
      : scene.add.ellipse(x, y + 2, 34, 9, 0x243626, 0.16);
    scene.add.existing(this);
    this.setName("garden-player");
    this.setOrigin(0.5, 1);
    this.setDepth(y + PLAYER_DEPTH_OFFSET);
    this.shadow.setDepth(y + PLAYER_DEPTH_OFFSET - 3);
    this.setData("characterTextureSource", textureSource);
    this.applyMotionVisual();
  }

  setMovementPosition(x: number, y: number): void {
    this.direction = resolvePlayerDirection(this, { x, y }, this.direction);

    this.setPosition(x, y);
    this.setDepth(y + PLAYER_DEPTH_OFFSET);
    this.shadow.setPosition(x, y + 2).setDepth(y + PLAYER_DEPTH_OFFSET - 3);
    this.applyMotionVisual();
  }

  setMoving(isMoving: boolean): void {
    if (this.isMoving === isMoving) {
      return;
    }

    this.isMoving = isMoving;
    this.applyMotionVisual();
  }

  faceTarget(target: Readonly<{ x: number; y: number }>): void {
    this.direction = resolvePlayerDirection(this, target, this.direction);
    this.applyMotionVisual();
  }

  destroy(fromScene?: boolean): void {
    this.shadow.destroy(fromScene);
    super.destroy(fromScene);
  }

  private applyMotionVisual(): void {
    this.setData({
      direction: this.direction,
      movementState: this.isMoving ? "moving" : "idle",
    });

    if (this.textureSource === "fallback") {
      this.setFlipX(this.direction === "left");
      this.setScale(this.isMoving ? 1.04 : 1, this.isMoving ? 0.98 : 1);
      return;
    }

    this.setFlipX(false);
    this.setScale(1);

    if (this.isMoving) {
      this.play(resolvePlayerWalkAnimationKey(this.direction), true);
      return;
    }

    this.anims.stop();
    this.setFrame(resolvePlayerFrame(this.direction));
  }
}
