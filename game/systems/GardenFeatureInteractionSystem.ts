import * as Phaser from "phaser";

import {
  GARDEN_FEATURE_HOTSPOTS,
  type GardenFeatureHotspotConfig,
  type GardenFeatureId,
} from "../config/garden-feature-hotspots";
import { GARDEN_RENDER_COLORS } from "../config/game-config";

type GardenFeatureClickHandler = (feature: GardenFeatureId) => void;

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  backgroundColor: "#3d2b1f",
  color: "#fff1c7",
  fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
  fontSize: "13px",
  fontStyle: "bold",
  padding: { x: 7, y: 4 },
};

class GardenFeatureHotspot {
  private readonly hitZone: Phaser.GameObjects.Zone;
  private readonly marker: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly chest: Phaser.GameObjects.Graphics | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: GardenFeatureHotspotConfig,
    onClick: GardenFeatureClickHandler,
  ) {
    this.hitZone = scene.add
      .zone(config.x, config.y, config.width, config.height)
      .setInteractive({ useHandCursor: true })
      .setDepth(config.id === "house" ? 3_850 : config.y + 1_000);
    this.marker = scene.add
      .graphics()
      .setDepth(config.id === "house" ? 3_851 : config.y + 1_002)
      .setVisible(false);
    this.label = scene.add
      .text(
        config.x,
        config.y + config.height / 2 + (config.id === "house" ? 2 : 6),
        config.label,
        LABEL_STYLE,
      )
      .setOrigin(0.5, 0)
      .setDepth(config.id === "house" ? 3_852 : config.y + 1_003)
      .setVisible(false);
    this.chest = config.id === "backup" ? this.drawBackupChest() : null;

    this.hitZone.on(Phaser.Input.Events.POINTER_OVER, this.showFeedback, this);
    this.hitZone.on(Phaser.Input.Events.POINTER_OUT, this.hideFeedback, this);
    this.hitZone.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (!pointer.leftButtonDown()) return;
        event.stopPropagation();
        this.flashFeedback();
        onClick(config.id);
      },
    );
    this.drawMarker();
  }

  destroy(): void {
    this.hitZone.removeAllListeners();
    this.hitZone.destroy();
    this.marker.destroy();
    this.label.destroy();
    this.chest?.destroy();
  }

  private showFeedback(): void {
    this.marker.setVisible(true);
    this.label.setVisible(true);
  }

  private hideFeedback(): void {
    this.marker.setVisible(false);
    this.label.setVisible(false);
  }

  private flashFeedback(): void {
    this.marker.setAlpha(1);
    this.scene.tweens.add({
      targets: this.marker,
      alpha: 0.5,
      duration: 90,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.marker.setAlpha(1),
    });
  }

  private drawMarker(): void {
    const { x, y, width, height } = this.config;
    const left = x - width / 2;
    const right = x + width / 2;
    const top = y - height / 2;
    const bottom = y + height / 2;
    const arm = this.config.id === "house" ? 14 : 8;

    this.marker.clear();
    this.marker.lineStyle(3, GARDEN_RENDER_COLORS.selection, 0.9);
    this.marker.beginPath();
    this.marker.moveTo(left, top + arm);
    this.marker.lineTo(left, top);
    this.marker.lineTo(left + arm, top);
    this.marker.moveTo(right - arm, top);
    this.marker.lineTo(right, top);
    this.marker.lineTo(right, top + arm);
    this.marker.moveTo(right, bottom - arm);
    this.marker.lineTo(right, bottom);
    this.marker.lineTo(right - arm, bottom);
    this.marker.moveTo(left + arm, bottom);
    this.marker.lineTo(left, bottom);
    this.marker.lineTo(left, bottom - arm);
    this.marker.strokePath();
  }

  private drawBackupChest(): Phaser.GameObjects.Graphics {
    const graphics = this.scene.add.graphics().setDepth(this.config.y + 1_001);
    const left = this.config.x - 15;
    const top = this.config.y - 15;

    graphics.fillStyle(0x4b2f1c, 0.32);
    graphics.fillEllipse(this.config.x, this.config.y + 7, 34, 10);
    graphics.lineStyle(2, 0x3f2819, 1);
    graphics.fillStyle(0x9d5b2d, 1);
    graphics.fillRect(left, top + 8, 30, 20);
    graphics.strokeRect(left, top + 8, 30, 20);
    graphics.fillStyle(0xc87a37, 1);
    graphics.fillRect(left + 2, top + 3, 26, 9);
    graphics.strokeRect(left + 2, top + 3, 26, 9);
    graphics.fillStyle(0xe0b052, 1);
    graphics.fillRect(this.config.x - 3, top + 11, 6, 8);
    graphics.lineStyle(1, 0x6f431f, 1);
    graphics.lineBetween(left + 2, top + 21, left + 28, top + 21);

    return graphics;
  }
}

export class GardenFeatureInteractionSystem {
  private readonly hotspots: GardenFeatureHotspot[];

  constructor(scene: Phaser.Scene, onClick: GardenFeatureClickHandler) {
    this.hotspots = Object.values(GARDEN_FEATURE_HOTSPOTS).map(
      (config) => new GardenFeatureHotspot(scene, config, onClick),
    );
  }

  destroy(): void {
    for (const hotspot of this.hotspots) {
      hotspot.destroy();
    }
  }
}
