import * as Phaser from "phaser";

import type { CompanionViewModel } from "../../domain/garden/companion-view-model";
import type { GardenPoint } from "../config/garden-map";
import { CompanionSprite, type CompanionClickHandler } from "../entities/CompanionSprite";
import { calculateCompanionRenderOperation } from "./companion-render-state";

export class CompanionRenderSystem {
  private sprite: CompanionSprite | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly position: GardenPoint,
    private readonly onCompanionClicked: CompanionClickHandler,
  ) {}

  setCompanion(companion: CompanionViewModel | null): void {
    const operation = calculateCompanionRenderOperation(this.sprite?.viewModel ?? null, companion);

    switch (operation.type) {
      case "none":
        return;
      case "remove":
        this.removeCompanion();
        return;
      case "create":
      case "replace":
        this.removeCompanion();
        this.sprite = new CompanionSprite(
          this.scene,
          operation.companion,
          this.position,
          this.onCompanionClicked,
        );
    }
  }

  destroy(): void {
    this.removeCompanion();
  }

  private removeCompanion(): void {
    this.sprite?.destroy();
    this.sprite = null;
  }
}
