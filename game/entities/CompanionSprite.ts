import * as Phaser from "phaser";

import type { CompanionViewModel } from "../../domain/garden/companion-view-model";
import {
  COMPANION_CHARACTER_ASSETS,
  GARDEN_ENTITY_SHADOW_ASSET,
  resolveCompanionIdleAnimationKey,
  resolveGardenCharacterTextureSource,
  type GardenCharacterTextureSource,
} from "../config/garden-character-animations";
import type { GardenPoint } from "../config/garden-map";
import { GARDEN_RENDER_COLORS } from "../config/game-config";

export type CompanionClickHandler = () => void;

const COMPANION_DEPTH_OFFSET = 1_000;
const COMPANION_HOVER_SCALE = 1.03;
const COMPANION_HIT_AREA = Object.freeze({
  x: -30,
  y: -58,
  width: 60,
  height: 60,
});

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export class CompanionSprite extends Phaser.GameObjects.Container {
  private readonly characterSprite: Phaser.GameObjects.Sprite | null;
  private readonly fallbackGraphics: Phaser.GameObjects.Graphics;
  private readonly feedbackMarker: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse;
  private readonly textureSource: GardenCharacterTextureSource;
  private companion: CompanionViewModel;

  constructor(
    scene: Phaser.Scene,
    companion: CompanionViewModel,
    position: GardenPoint,
    onClick: CompanionClickHandler,
  ) {
    super(scene, position.x, position.y);
    this.companion = companion;
    const asset = COMPANION_CHARACTER_ASSETS[companion.type];
    this.textureSource = resolveGardenCharacterTextureSource(scene.textures.exists(asset.key));
    this.shadow = scene.textures.exists(GARDEN_ENTITY_SHADOW_ASSET.key)
      ? new Phaser.GameObjects.Image(scene, 0, 2, GARDEN_ENTITY_SHADOW_ASSET.key)
          .setAlpha(0.16)
          .setScale(0.68, 0.8)
      : new Phaser.GameObjects.Ellipse(scene, 0, 2, 32, 8, 0x243626, 0.14);
    this.feedbackMarker = new Phaser.GameObjects.Graphics(scene);
    this.fallbackGraphics = new Phaser.GameObjects.Graphics(scene);
    this.characterSprite =
      this.textureSource === "formal"
        ? new Phaser.GameObjects.Sprite(scene, 0, 0, asset.key, 0).setOrigin(0.5, 1)
        : null;
    this.add([
      this.shadow,
      this.feedbackMarker,
      this.fallbackGraphics,
      ...(this.characterSprite === null ? [] : [this.characterSprite]),
    ]);

    scene.add.existing(this);
    this.setName("garden-companion");
    this.setDepth(position.y + COMPANION_DEPTH_OFFSET);
    this.setData({
      companionType: companion.type,
      characterTextureSource: this.textureSource,
    });
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
    this.drawFeedbackMarker();
    this.applyCharacterVisual();
  }

  get viewModel(): CompanionViewModel {
    return this.companion;
  }

  destroy(fromScene?: boolean): void {
    this.removeAllListeners();
    super.destroy(fromScene);
  }

  private handlePointerOver(): void {
    this.feedbackMarker.setVisible(true);
    this.setScale(COMPANION_HOVER_SCALE);
  }

  private handlePointerOut(): void {
    this.feedbackMarker.setVisible(false);
    this.setScale(1);
  }

  private applyCharacterVisual(): void {
    if (this.characterSprite === null) {
      this.drawFallbackCompanion();
      return;
    }

    this.fallbackGraphics.setVisible(false);
    const animationKey = resolveCompanionIdleAnimationKey(this.companion.type);

    if (prefersReducedMotion() || !this.scene.anims.exists(animationKey)) {
      this.characterSprite.setFrame(0);
      return;
    }

    this.characterSprite.play(animationKey);
  }

  private drawFeedbackMarker(): void {
    this.feedbackMarker.clear();
    this.feedbackMarker.fillStyle(GARDEN_RENDER_COLORS.companionHover, 0.72);
    this.feedbackMarker.fillRect(-19, -3, 7, 2);
    this.feedbackMarker.fillRect(-19, -3, 2, 6);
    this.feedbackMarker.fillRect(12, -3, 7, 2);
    this.feedbackMarker.fillRect(17, -3, 2, 6);
    this.feedbackMarker.setVisible(false);
  }

  private drawFallbackCompanion(): void {
    const fillColor =
      this.companion.type === "cat"
        ? GARDEN_RENDER_COLORS.companionCat
        : GARDEN_RENDER_COLORS.companionDog;

    this.fallbackGraphics.clear();
    this.fallbackGraphics.setVisible(true);
    this.fallbackGraphics.lineStyle(2, GARDEN_RENDER_COLORS.companionOutline, 1);
    this.fallbackGraphics.fillStyle(fillColor, 1);
    this.fallbackGraphics.fillRoundedRect(-15, -34, 30, 33, 12);
    this.fallbackGraphics.strokeRoundedRect(-15, -34, 30, 33, 12);

    if (this.companion.type === "cat") {
      this.drawFallbackCatHead(fillColor);
    } else {
      this.drawFallbackDogHead(fillColor);
    }

    this.fallbackGraphics.fillStyle(GARDEN_RENDER_COLORS.companionOutline, 1);
    this.fallbackGraphics.fillCircle(-5, -43, 2);
    this.fallbackGraphics.fillCircle(5, -43, 2);
    this.fallbackGraphics.fillStyle(GARDEN_RENDER_COLORS.companionAccent, 1);
    this.fallbackGraphics.fillCircle(0, -37, 4);
  }

  private drawFallbackCatHead(fillColor: number): void {
    this.fallbackGraphics.fillStyle(fillColor, 1);
    this.fallbackGraphics.fillTriangle(-14, -48, -8, -62, -2, -50);
    this.fallbackGraphics.fillTriangle(2, -50, 8, -62, 14, -48);
    this.fallbackGraphics.fillCircle(0, -43, 16);
  }

  private drawFallbackDogHead(fillColor: number): void {
    this.fallbackGraphics.fillStyle(fillColor, 1);
    this.fallbackGraphics.fillRoundedRect(-21, -56, 10, 23, 5);
    this.fallbackGraphics.fillRoundedRect(11, -56, 10, 23, 5);
    this.fallbackGraphics.fillCircle(0, -43, 16);
  }
}
