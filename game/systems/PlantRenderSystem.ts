import * as Phaser from "phaser";

import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import {
  getContentPlantPreviewVisualState,
  type ContentPlantPreviewMode,
} from "../config/content-plant-preview";
import { PLANT_SLOT_CONFIGS } from "../config/garden-map";
import { PlantSprite, type PlantClickHandler } from "../entities/PlantSprite";
import { calculatePlantRenderDiff } from "./plant-render-diff";

const PLANT_SLOT_BY_ID = new Map(PLANT_SLOT_CONFIGS.map((slot) => [slot.id, slot] as const));

export class PlantRenderSystem {
  private readonly sprites = new Map<string, PlantSprite>();
  private selectedPlantId: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPlantClicked: PlantClickHandler,
    private readonly contentPlantPreview: ContentPlantPreviewMode | null = null,
  ) {}

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
      existingSprite.setPreviewVisualState(
        getContentPlantPreviewVisualState(this.contentPlantPreview, plant.plantId),
      );
      return;
    }

    const sprite = new PlantSprite(this.scene, plant, slot, this.onPlantClicked);
    sprite.setSelected(this.selectedPlantId === plant.plantId);
    sprite.setPreviewVisualState(
      getContentPlantPreviewVisualState(this.contentPlantPreview, plant.plantId),
    );
    this.sprites.set(plant.plantId, sprite);
  }

  getPlant(plantId: string): PlantViewModel | undefined {
    return this.sprites.get(plantId)?.viewModel;
  }

  getOccupiedSlotIds(): readonly string[] {
    return [...this.sprites.values()].map((sprite) => sprite.viewModel.slotId);
  }

  getPlants(): readonly PlantViewModel[] {
    return [...this.sprites.values()].map((sprite) => sprite.viewModel);
  }

  hasPlant(plantId: string): boolean {
    return this.sprites.has(plantId);
  }

  setSelectedPlant(plantId: string | null): void {
    this.selectedPlantId = plantId;

    for (const [currentPlantId, sprite] of this.sprites) {
      sprite.setSelected(currentPlantId === plantId);
    }
  }

  removePlant(plantId: string): void {
    const sprite = this.sprites.get(plantId);

    if (sprite === undefined) {
      return;
    }

    sprite.destroy();
    this.sprites.delete(plantId);

    if (this.selectedPlantId === plantId) {
      this.selectedPlantId = null;
    }
  }

  destroy(): void {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }

    this.sprites.clear();
    this.selectedPlantId = null;
  }
}
