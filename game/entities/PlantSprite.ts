import * as Phaser from "phaser";

import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import type { PlantSlotConfig } from "../config/garden-map";
import { GARDEN_RENDER_COLORS, PLANT_TEXTURE_KEYS } from "../config/game-config";

export type PlantClickHandler = (plant: PlantViewModel) => void;

export class PlantSprite extends Phaser.GameObjects.Image {
  private plant: PlantViewModel;
  private readonly selectionRing: Phaser.GameObjects.Ellipse;

  constructor(
    scene: Phaser.Scene,
    plant: PlantViewModel,
    slot: PlantSlotConfig,
    onClick: PlantClickHandler,
  ) {
    super(scene, slot.x, slot.y, PLANT_TEXTURE_KEYS[plant.stage]);
    this.plant = plant;
    this.selectionRing = scene.add
      .ellipse(slot.x, slot.y + 1, 58, 27)
      .setStrokeStyle(3, GARDEN_RENDER_COLORS.selection, 0.95)
      .setVisible(false);

    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setInteractive({ useHandCursor: true });
    this.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        onClick(this.plant);
      },
    );
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
    this.selectionRing.setPosition(slot.x, slot.y + 1);
    this.selectionRing.setDepth(slot.y - 1);
    this.setData({
      plantId: plant.plantId,
      fragmentId: plant.fragmentId,
      slotId: plant.slotId,
      title: plant.title,
    });
  }

  setSelected(isSelected: boolean): void {
    this.selectionRing.setVisible(isSelected);
  }

  destroy(fromScene?: boolean): void {
    this.selectionRing.destroy(fromScene);
    super.destroy(fromScene);
  }
}
