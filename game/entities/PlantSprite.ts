import * as Phaser from "phaser";

import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import {
  CONTENT_PLANT_ASSET,
  CONTENT_PLANT_FALLBACK_SHADOW_TEXTURE_KEY,
  CONTENT_PLANT_SHADOW_TEXTURE_KEY,
  CONTENT_PLANT_TEXTURE_KEY,
  resolveContentPlantAppearance,
  resolveContentPlantDisplaySize,
  resolveContentPlantFrame,
  resolveContentPlantSpeciesConfig,
  resolveContentPlantStage,
  resolveContentPlantTextureSource,
} from "../config/content-plant-species";
import type { ContentPlantPreviewVisualState } from "../config/content-plant-preview";
import type { PlantSlotConfig } from "../config/garden-map";
import { GARDEN_RENDER_COLORS, PLANT_TEXTURE_KEYS } from "../config/game-config";
import type { PlantFeedbackKind } from "../config/plant-feedback";

export type PlantClickHandler = (plant: PlantViewModel) => void;

const CONTENT_PLANT_DEPTH_OFFSET = 1_000;
const CONTENT_PLANT_HOVER_SCALE = 1.03;
const CONTENT_PLANT_HIT_AREA_PADDING = 4;
const PLANT_FEEDBACK_DURATIONS: Readonly<Record<PlantFeedbackKind, number>> = Object.freeze({
  created: 520,
  dormant: 360,
  restored: 460,
  arrived: 280,
});

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export class PlantSprite extends Phaser.GameObjects.Image {
  private static hasLoggedTextureFallback = false;

  private plant: PlantViewModel;
  private readonly idleTween: Phaser.Tweens.Tween;
  private readonly isReducedMotion: boolean;
  private readonly feedbackMarker: Phaser.GameObjects.Graphics;
  private readonly selectionMarker: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Image;
  private baseY: number;
  private feedbackGeneration = 0;
  private feedbackTimer: Phaser.Time.TimerEvent | null = null;
  private feedbackTween: Phaser.Tweens.Tween | null = null;
  private hasIdleTweenStarted = false;
  private isHovered = false;
  private isSelected = false;
  private previewVisualState: ContentPlantPreviewVisualState = null;

  constructor(
    scene: Phaser.Scene,
    plant: PlantViewModel,
    slot: PlantSlotConfig,
    onClick: PlantClickHandler,
  ) {
    const textureSource = resolveContentPlantTextureSource(
      scene.textures.exists(CONTENT_PLANT_TEXTURE_KEY),
    );
    const textureKey =
      textureSource === "content"
        ? CONTENT_PLANT_TEXTURE_KEY
        : PLANT_TEXTURE_KEYS[resolveContentPlantStage(plant)];

    super(
      scene,
      slot.x,
      slot.y,
      textureKey,
      textureSource === "content" ? resolveContentPlantFrame(plant) : undefined,
    );

    this.plant = plant;
    this.baseY = slot.y;
    this.isReducedMotion = prefersReducedMotion();
    const shadowTextureKey = scene.textures.exists(CONTENT_PLANT_SHADOW_TEXTURE_KEY)
      ? CONTENT_PLANT_SHADOW_TEXTURE_KEY
      : CONTENT_PLANT_FALLBACK_SHADOW_TEXTURE_KEY;
    this.shadow = scene.add.image(slot.x, slot.y + 2, shadowTextureKey).setAlpha(0.2);
    this.selectionMarker = scene.add.graphics();
    this.feedbackMarker = scene.add.graphics().setVisible(false);

    scene.add.existing(this);
    this.setName("garden-content-plant");
    this.setOrigin(0.5, 1);
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, 64, 80),
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
        onClick(this.plant);
      },
    );
    const motionSeed = resolveContentPlantFrame(plant) * 97 + plant.plantId.length * 31;
    this.idleTween = scene.tweens.add({
      targets: this,
      angle: { from: -0.45, to: 0.45 },
      delay: motionSeed % 700,
      duration: 2_600 + (motionSeed % 1_200),
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      paused: true,
    });
    this.updatePlant(plant, slot);
  }

  get viewModel(): PlantViewModel {
    return this.plant;
  }

  updatePlant(plant: PlantViewModel, slot: PlantSlotConfig): void {
    this.cancelFeedback();
    this.plant = plant;
    this.baseY = slot.y;
    this.setPosition(slot.x, slot.y);
    this.applyPlantTexture();
    this.applySpeciesProfile();
    this.setDepth(slot.y + CONTENT_PLANT_DEPTH_OFFSET);
    this.shadow.setPosition(slot.x, slot.y + 2).setDepth(slot.y + CONTENT_PLANT_DEPTH_OFFSET - 3);
    this.selectionMarker
      .setPosition(slot.x, slot.y + 2)
      .setDepth(slot.y + CONTENT_PLANT_DEPTH_OFFSET - 2);
    this.feedbackMarker
      .setPosition(slot.x, slot.y)
      .setDepth(slot.y + CONTENT_PLANT_DEPTH_OFFSET + 2);
    this.setData({
      plantId: plant.plantId,
      fragmentId: plant.fragmentId,
      slotId: plant.slotId,
      title: plant.title,
    });
    this.applyVisualState();
  }

  setSelected(isSelected: boolean): void {
    this.isSelected = isSelected;
    this.applyVisualState();
  }

  setPreviewVisualState(state: ContentPlantPreviewVisualState): void {
    this.previewVisualState = state;
    this.applyVisualState();
  }

  playFeedback(feedback: PlantFeedbackKind, onComplete?: () => void): void {
    this.cancelFeedback();
    this.feedbackGeneration += 1;
    const generation = this.feedbackGeneration;
    const duration = PLANT_FEEDBACK_DURATIONS[feedback];
    const targetAlpha = this.alpha;
    const targetScale = this.scaleX;
    const targetY = this.y;

    this.idleTween.pause();
    this.setAngle(0);
    this.drawFeedbackMarker(feedback);
    this.feedbackMarker.setAlpha(1).setVisible(true);
    this.setData("plantFeedback", feedback);

    if (!this.isReducedMotion) {
      if (feedback === "created") {
        this.setAlpha(0.12)
          .setScale(targetScale * 0.72)
          .setY(targetY + 8);
        this.feedbackTween = this.scene.tweens.add({
          targets: this,
          alpha: targetAlpha,
          scaleX: targetScale,
          scaleY: targetScale,
          y: targetY,
          duration: duration - 40,
          ease: "Sine.easeOut",
        });
      } else if (feedback === "dormant") {
        this.setAlpha(1);
        this.feedbackTween = this.scene.tweens.add({
          targets: this,
          alpha: targetAlpha,
          duration: duration - 40,
          ease: "Sine.easeInOut",
        });
      } else {
        if (feedback === "restored") {
          this.clearTint();
        }
        this.setScale(targetScale * 0.97);
        this.feedbackTween = this.scene.tweens.add({
          targets: this,
          scaleX: targetScale * 1.035,
          scaleY: targetScale * 1.035,
          y: targetY - 1,
          duration: Math.floor((duration - 40) / 2),
          ease: "Sine.easeInOut",
          yoyo: true,
        });
      }
    }

    this.feedbackTimer = this.scene.time.delayedCall(duration, () => {
      if (generation !== this.feedbackGeneration) {
        return;
      }

      this.feedbackTimer = null;
      this.feedbackTween = null;
      this.feedbackMarker.setVisible(false);
      this.setData("plantFeedback", null);
      this.applyVisualState();
      onComplete?.();
    });
  }

  destroy(fromScene?: boolean): void {
    this.removeAllListeners();
    this.cancelFeedback();
    this.idleTween.remove();
    this.shadow.destroy(fromScene);
    this.selectionMarker.destroy(fromScene);
    this.feedbackMarker.destroy(fromScene);
    super.destroy(fromScene);
  }

  private applyPlantTexture(): void {
    const textureSource = resolveContentPlantTextureSource(
      this.scene.textures.exists(CONTENT_PLANT_TEXTURE_KEY),
    );

    if (textureSource === "content") {
      this.setTexture(CONTENT_PLANT_TEXTURE_KEY, resolveContentPlantFrame(this.plant));
      return;
    }

    if (!PlantSprite.hasLoggedTextureFallback) {
      PlantSprite.hasLoggedTextureFallback = true;
      console.warn("Content plant textures are unavailable; using the generated fallback.");
    }

    this.setTexture(PLANT_TEXTURE_KEYS[resolveContentPlantStage(this.plant)]);
  }

  private applyVisualState(): void {
    const speciesConfig = resolveContentPlantSpeciesConfig(this.plant);
    const appearance = resolveContentPlantAppearance(
      this.plant.vitality,
      this.isReducedMotion,
      speciesConfig.dormantTint,
    );
    const isHovered = this.isHovered || this.previewVisualState === "hover";
    const isSelected = this.isSelected || this.previewVisualState === "selected";

    this.setAlpha(appearance.alpha);
    this.setScale(isHovered ? CONTENT_PLANT_HOVER_SCALE : 1);
    this.setY(this.baseY - (isHovered ? 1 : 0));
    this.shadow.setAlpha(this.plant.vitality === "dormant" ? 0.12 : 0.2);
    this.selectionMarker.setVisible(isSelected);

    if (appearance.tint === null) {
      this.clearTint();
    } else {
      this.setTint(appearance.tint);
    }

    if (appearance.idleMotionEnabled) {
      if (this.hasIdleTweenStarted) {
        this.idleTween.resume();
      } else {
        this.hasIdleTweenStarted = true;
        this.idleTween.play();
      }
    } else {
      this.idleTween.pause();
      this.setAngle(0);
    }
  }

  private applySpeciesProfile(): void {
    const config = resolveContentPlantSpeciesConfig(this.plant);
    const displaySize = resolveContentPlantDisplaySize(this.plant);
    const hitAreaX =
      (CONTENT_PLANT_ASSET.frameWidth - config.hitArea.width) / 2 - CONTENT_PLANT_HIT_AREA_PADDING;
    const hitAreaY =
      CONTENT_PLANT_ASSET.frameHeight -
      config.hitArea.height +
      config.hitArea.offsetY -
      CONTENT_PLANT_HIT_AREA_PADDING;

    if (this.input !== null) {
      this.input.hitArea = new Phaser.Geom.Rectangle(
        hitAreaX,
        hitAreaY,
        config.hitArea.width + CONTENT_PLANT_HIT_AREA_PADDING * 2,
        config.hitArea.height + CONTENT_PLANT_HIT_AREA_PADDING * 2,
      );
      this.input.hitAreaCallback = Phaser.Geom.Rectangle.Contains;
    }

    this.shadow.setScale(config.shadowScale, 1);
    this.drawSelectionMarker(displaySize.width);
    this.setData({
      contentPlantVisualWidth: displaySize.width,
      contentPlantVisualHeight: displaySize.height,
    });
  }

  private drawSelectionMarker(displayWidth: number): void {
    const halfWidth = Math.min(25, Math.max(16, Math.round(displayWidth / 2)));

    this.selectionMarker.clear();
    this.selectionMarker.fillStyle(GARDEN_RENDER_COLORS.selection, 0.72);
    this.selectionMarker.fillRect(-halfWidth, -3, 7, 2);
    this.selectionMarker.fillRect(-halfWidth, -3, 2, 6);
    this.selectionMarker.fillRect(halfWidth - 7, -3, 7, 2);
    this.selectionMarker.fillRect(halfWidth - 2, -3, 2, 6);
    this.selectionMarker.setVisible(false);
  }

  private drawFeedbackMarker(feedback: PlantFeedbackKind): void {
    this.feedbackMarker.clear();

    if (feedback === "created") {
      this.feedbackMarker.fillStyle(GARDEN_RENDER_COLORS.soilEdge, 0.72);
      this.feedbackMarker.fillRect(-15, 0, 7, 2);
      this.feedbackMarker.fillRect(-4, 2, 8, 2);
      this.feedbackMarker.fillRect(8, 0, 7, 2);
      this.feedbackMarker.fillStyle(GARDEN_RENDER_COLORS.leaf, 0.88);
      this.feedbackMarker.fillRect(-12, -6, 3, 3);
      this.feedbackMarker.fillRect(9, -8, 3, 3);
      return;
    }

    if (feedback === "dormant") {
      this.feedbackMarker.fillStyle(0x8aa0a0, 0.62);
      this.feedbackMarker.fillRect(-13, -2, 6, 2);
      this.feedbackMarker.fillRect(7, -2, 6, 2);
      return;
    }

    if (feedback === "restored") {
      this.feedbackMarker.fillStyle(GARDEN_RENDER_COLORS.leaf, 0.9);
      this.feedbackMarker.fillRect(-16, -13, 4, 4);
      this.feedbackMarker.fillRect(12, -20, 3, 3);
      this.feedbackMarker.fillStyle(GARDEN_RENDER_COLORS.permanentBloom, 0.82);
      this.feedbackMarker.fillRect(-2, -30, 3, 3);
      return;
    }

    this.feedbackMarker.fillStyle(GARDEN_RENDER_COLORS.selection, 0.78);
    this.feedbackMarker.fillRect(-20, -5, 7, 2);
    this.feedbackMarker.fillRect(-20, -5, 2, 7);
    this.feedbackMarker.fillRect(13, -5, 7, 2);
    this.feedbackMarker.fillRect(18, -5, 2, 7);
  }

  private cancelFeedback(): void {
    this.feedbackGeneration += 1;
    this.feedbackTimer?.remove(false);
    this.feedbackTimer = null;
    this.feedbackTween?.remove();
    this.feedbackTween = null;
    this.feedbackMarker.setVisible(false);
    this.setData("plantFeedback", null);
    this.applyVisualState();
  }

  private handlePointerOver(): void {
    this.isHovered = true;
    this.applyVisualState();
  }

  private handlePointerOut(): void {
    this.isHovered = false;
    this.applyVisualState();
  }
}
