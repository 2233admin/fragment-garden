import * as Phaser from "phaser";

import { PLAYER_TEXTURE_KEY } from "../config/game-config";

export class PlayerSprite extends Phaser.GameObjects.Image {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, PLAYER_TEXTURE_KEY);

    scene.add.existing(this);
    this.setName("garden-player");
    this.setOrigin(0.5, 1);
    this.setDepth(y + 1_000);
  }

  setMovementPosition(x: number, y: number): void {
    if (x !== this.x) {
      this.setFlipX(x < this.x);
    }

    this.setPosition(x, y);
    this.setDepth(y + 1_000);
  }

  setMoving(isMoving: boolean): void {
    this.setScale(isMoving ? 1.04 : 1, isMoving ? 0.98 : 1);
  }
}
