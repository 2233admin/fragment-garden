import * as Phaser from "phaser";

import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import type { PlantSlotConfig } from "../config/garden-map";
import { PLANT_TEXTURE_KEYS } from "../config/game-config";

export class PlantSprite extends Phaser.GameObjects.Image {
  private plant: PlantViewModel;

  constructor(scene: Phaser.Scene, plant: PlantViewModel, slot: PlantSlotConfig) {
    super(scene, slot.x, slot.y, PLANT_TEXTURE_KEYS[plant.stage]);
    this.plant = plant;

    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.updatePlant(plant, slot);
  }

  get viewModel(): PlantViewModel {
    return this.plant;
  }

  updatePlant(plant: PlantViewModel, slot: PlantSlotConfig): void {
    this.plant = plant;
    this.setPosition(slot.x, slot.y);
    this.setTexture(PLANT_TEXTURE_KEYS[plant.stage]);
    this.setAlpha(plant.vitality === "dormant" ? 0.55 : 1);
    this.setDepth(slot.y);
    this.setData({
      plantId: plant.plantId,
      fragmentId: plant.fragmentId,
      slotId: plant.slotId,
      title: plant.title,
    });
  }
}
