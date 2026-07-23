import * as Phaser from "phaser";

import type { CompanionViewModel } from "../../domain/garden/companion-view-model";
import type { GardenPoint } from "../config/garden-map";
import { GARDEN_RENDER_COLORS } from "../config/game-config";

export type CompanionClickHandler = () => void;

const COMPANION_HIT_AREA = Object.freeze({
  x: -34,
  y: -70,
  width: 68,
  height: 72,
});

export class CompanionSprite extends Phaser.GameObjects.Container {
  private readonly feedbackRing: Phaser.GameObjects.Ellipse;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private companion: CompanionViewModel;

  constructor(
    scene: Phaser.Scene,
    companion: CompanionViewModel,
    position: GardenPoint,
    onClick: CompanionClickHandler,
  ) {
    super(scene, position.x, position.y);
    this.companion = companion;
    this.feedbackRing = new Phaser.GameObjects.Ellipse(scene, 0, -34, 72, 72)
      .setStrokeStyle(3, GARDEN_RENDER_COLORS.companionHover, 0.95)
      .setVisible(false);
    this.graphics = new Phaser.GameObjects.Graphics(scene);
    this.add([this.feedbackRing, this.graphics]);

    scene.add.existing(this);
    this.setName("garden-companion");
    this.setDepth(position.y + 500);
    this.setData("companionType", companion.type);
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(
        COMPANION_HIT_AREA.x,
        COMPANION_HIT_AREA.y,
        COMPANION_HIT_AREA.width,
        COMPANION_HIT_AREA.height,
      ),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    this.on(Phaser.Input.Events.POINTER_OVER, this.handlePointerOver, this);
    this.on(Phaser.Input.Events.POINTER_OUT, this.handlePointerOut, this);
    this.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        onClick();
      },
    );
    this.drawCompanion();
  }

  get viewModel(): CompanionViewModel {
    return this.companion;
  }

  destroy(fromScene?: boolean): void {
    this.removeAllListeners();
    super.destroy(fromScene);
  }

  private handlePointerOver(): void {
    this.feedbackRing.setVisible(true);
    this.setScale(1.05);
  }

  private handlePointerOut(): void {
    this.feedbackRing.setVisible(false);
    this.setScale(1);
  }

  private drawCompanion(): void {
    const fillColor =
      this.companion.type === "cat"
        ? GARDEN_RENDER_COLORS.companionCat
        : GARDEN_RENDER_COLORS.companionDog;

    this.graphics.clear();
    this.graphics.fillStyle(GARDEN_RENDER_COLORS.companionOutline, 0.18);
    this.graphics.fillEllipse(0, -3, 46, 14);
    this.graphics.lineStyle(2, GARDEN_RENDER_COLORS.companionOutline, 1);
    this.graphics.fillStyle(fillColor, 1);
    this.graphics.fillRoundedRect(-18, -41, 36, 38, 14);
    this.graphics.strokeRoundedRect(-18, -41, 36, 38, 14);

    if (this.companion.type === "cat") {
      this.drawCatHead(fillColor);
    } else {
      this.drawDogHead(fillColor);
    }

    this.drawFace();
  }

  private drawCatHead(fillColor: number): void {
    this.graphics.fillStyle(fillColor, 1);
    this.graphics.fillTriangle(-17, -57, -10, -76, -2, -59);
    this.graphics.strokeTriangle(-17, -57, -10, -76, -2, -59);
    this.graphics.fillTriangle(2, -59, 10, -76, 17, -57);
    this.graphics.strokeTriangle(2, -59, 10, -76, 17, -57);
    this.graphics.fillCircle(0, -52, 20);
    this.graphics.strokeCircle(0, -52, 20);
  }

  private drawDogHead(fillColor: number): void {
    this.graphics.fillStyle(fillColor, 1);
    this.graphics.fillRoundedRect(-27, -66, 13, 29, 6);
    this.graphics.strokeRoundedRect(-27, -66, 13, 29, 6);
    this.graphics.fillRoundedRect(14, -66, 13, 29, 6);
    this.graphics.strokeRoundedRect(14, -66, 13, 29, 6);
    this.graphics.fillCircle(0, -52, 20);
    this.graphics.strokeCircle(0, -52, 20);
  }

  private drawFace(): void {
    this.graphics.fillStyle(GARDEN_RENDER_COLORS.companionOutline, 1);
    this.graphics.fillCircle(-7, -54, 2);
    this.graphics.fillCircle(7, -54, 2);
    this.graphics.fillStyle(GARDEN_RENDER_COLORS.companionAccent, 1);
    this.graphics.fillCircle(0, -46, 5);
    this.graphics.lineStyle(2, GARDEN_RENDER_COLORS.companionOutline, 1);
    this.graphics.strokeCircle(0, -46, 5);
  }
}
