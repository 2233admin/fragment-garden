import * as Phaser from "phaser";

import type { GardenMapConfig } from "../config/garden-map";
import { GARDEN_RENDER_COLORS } from "../config/game-config";

export class GardenMapRenderer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: GardenMapConfig,
  ) {}

  render(): void {
    const graphics = this.scene.add.graphics();

    graphics.fillStyle(GARDEN_RENDER_COLORS.background, 1);
    graphics.fillRect(0, 0, this.config.width, this.config.height);

    for (const [index, area] of this.config.grassAreas.entries()) {
      graphics.fillStyle(
        index % 2 === 0 ? GARDEN_RENDER_COLORS.grass : GARDEN_RENDER_COLORS.grassShade,
        1,
      );
      graphics.fillRoundedRect(area.x, area.y, area.width, area.height, 24);
    }

    const road = this.config.roadArea;
    graphics.fillStyle(GARDEN_RENDER_COLORS.pathEdge, 1);
    graphics.fillRoundedRect(road.x - 7, road.y, road.width + 14, road.height, 28);
    graphics.fillStyle(GARDEN_RENDER_COLORS.path, 1);
    graphics.fillRoundedRect(road.x, road.y, road.width, road.height, 24);

    for (const slot of this.config.plantSlots) {
      graphics.fillStyle(GARDEN_RENDER_COLORS.soil, 0.72);
      graphics.fillEllipse(slot.x, slot.y + 1, 48, 19);
      graphics.lineStyle(2, GARDEN_RENDER_COLORS.soilEdge, 0.5);
      graphics.strokeEllipse(slot.x, slot.y + 1, 48, 19);
    }

    const pond = this.config.pondArea;
    graphics.fillStyle(GARDEN_RENDER_COLORS.pondEdge, 1);
    graphics.fillEllipse(
      pond.x + pond.width / 2,
      pond.y + pond.height / 2,
      pond.width + 12,
      pond.height + 12,
    );
    graphics.fillStyle(GARDEN_RENDER_COLORS.pond, 1);
    graphics.fillEllipse(
      pond.x + pond.width / 2,
      pond.y + pond.height / 2,
      pond.width,
      pond.height,
    );

    graphics.lineStyle(4, GARDEN_RENDER_COLORS.border, 0.9);
    graphics.strokeRoundedRect(12, 12, this.config.width - 24, this.config.height - 24, 28);
    graphics.setDepth(-1_000);
  }
}
