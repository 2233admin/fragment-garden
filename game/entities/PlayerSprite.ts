import * as Phaser from "phaser";

import { PLAYER_TEXTURE_KEY } from "../config/game-config";

export class PlayerSprite extends Phaser.GameObjects.Image {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, PLAYER_TEXTURE_KEY);

    scene.add.existing(this);
    this.setName("static-player-placeholder");
    this.setOrigin(0.5, 1);
    this.setDepth(y + 1_000);
  }
}
