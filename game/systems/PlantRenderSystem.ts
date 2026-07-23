import * as Phaser from "phaser";

import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import { PLANT_SLOT_CONFIGS } from "../config/garden-map";
import { PlantSprite } from "../entities/PlantSprite";
import { calculatePlantRenderDiff } from "./plant-render-diff";

const PLANT_SLOT_BY_ID = new Map(PLANT_SLOT_CONFIGS.map((slot) => [slot.id, slot] as const));

export class PlantRenderSystem {
  private readonly sprites = new Map<string, PlantSprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  loadGarden(plants: readonly PlantViewModel[]): void {
    const previousPlants = [...this.sprites.values()].map((sprite) => sprite.viewModel);
    const diff = calculatePlantRenderDiff(previousPlants, plants);

    for (const plantId of diff.removedPlantIds) {
      this.removePlant(plantId);
    }

    for (const plant of diff.added) {
      this.addOrUpdatePlant(plant);
    }

    for (const plant of diff.updated) {
      this.addOrUpdatePlant(plant);
    }
  }

  addOrUpdatePlant(plant: PlantViewModel): void {
    const slot = PLANT_SLOT_BY_ID.get(plant.slotId);

    if (slot === undefined) {
      throw new Error(`Unknown plant slot: ${plant.slotId}`);
    }

    const existingSprite = this.sprites.get(plant.plantId);

    if (existingSprite !== undefined) {
      existingSprite.updatePlant(plant, slot);
      return;
    }

    this.sprites.set(plant.plantId, new PlantSprite(this.scene, plant, slot));
  }

  removePlant(plantId: string): void {
    const sprite = this.sprites.get(plantId);

    if (sprite === undefined) {
      return;
    }

    sprite.destroy();
    this.sprites.delete(plantId);
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }

    this.sprites.clear();
  }
}
