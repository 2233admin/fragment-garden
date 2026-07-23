import type { PlantViewModel, WorldPosition } from "../../domain";
import type { GameBridge } from "../bridge/game-bridge";
import type { MovementFailureReason } from "../bridge/game-events";
import type { GardenMapConfig, PlantSlotConfig } from "../config/garden-map";
import { GARDEN_RENDER_COLORS } from "../config/game-config";
import type { MovementSystem } from "./MovementSystem";
import type { PathfindingSystem } from "./PathfindingSystem";
import type { PlantRenderSystem } from "./PlantRenderSystem";
import * as Phaser from "phaser";

type SelectedPlantHandler = (plantId: string | null) => void;

const FAILURE_MARKER_DURATION_MS = 900;

export class InteractionSystem {
  private readonly slotById: ReadonlyMap<string, PlantSlotConfig>;
  private readonly targetMarker: Phaser.GameObjects.Arc;
  private activePlantId: string | null = null;
  private requestGeneration = 0;
  private failureMarkerTimer: Phaser.Time.TimerEvent | null = null;
  private isDestroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    config: GardenMapConfig,
    private readonly bridge: GameBridge,
    private readonly pathfinding: PathfindingSystem,
    private readonly movement: MovementSystem,
    private readonly plants: PlantRenderSystem,
    private readonly onSelectedPlantChange: SelectedPlantHandler,
  ) {
    this.slotById = new Map(config.plantSlots.map((slot) => [slot.id, slot] as const));
    this.targetMarker = scene.add
      .circle(0, 0, 10, GARDEN_RENDER_COLORS.movementTarget, 0.12)
      .setStrokeStyle(3, GARDEN_RENDER_COLORS.movementTarget, 0.95)
      .setDepth(2_000)
      .setVisible(false);
  }

  moveToGround(targetWorldPosition: WorldPosition): void {
    const generation = this.beginRequest(null);
    const target = this.pathfinding.worldToGrid(targetWorldPosition);
    const targetCenter = this.pathfinding.gridToWorld(target);
    this.showTargetMarker(targetCenter);

    if (
      !this.pathfinding.isWorldPositionInsideMap(targetWorldPosition) ||
      !this.pathfinding.isWalkable(target)
    ) {
      this.failMovement("target_blocked", undefined, targetCenter);
      return;
    }

    const path = this.pathfinding.findPath(this.movement.position, target);

    if (path === null) {
      this.failMovement("path_not_found", undefined, targetCenter);
      return;
    }

    this.bridge.publishToReact({
      type: "MOVEMENT_STARTED",
      targetType: "ground",
    });
    this.movement.start(path, target, () => {
      if (this.isDestroyed || generation !== this.requestGeneration) {
        return;
      }

      this.targetMarker.setVisible(false);
    });
  }

  moveToPlant(plant: PlantViewModel): void {
    const generation = this.beginRequest(plant.plantId);
    const slot = this.slotById.get(plant.slotId);

    if (slot === undefined || !this.plants.hasPlant(plant.plantId)) {
      this.failMovement("plant_unavailable", plant.plantId, this.movement.position);
      return;
    }

    const targetWorldPosition = {
      x: slot.interactionX,
      y: slot.interactionY,
    };
    const target = this.pathfinding.worldToGrid(targetWorldPosition);
    this.showTargetMarker(targetWorldPosition);

    if (!this.pathfinding.isWalkable(target)) {
      this.failMovement("target_blocked", plant.plantId, targetWorldPosition);
      return;
    }

    const path = this.pathfinding.findPath(this.movement.position, target);

    if (path === null) {
      this.failMovement("path_not_found", plant.plantId, targetWorldPosition);
      return;
    }

    this.bridge.publishToReact({
      type: "MOVEMENT_STARTED",
      targetType: "plant",
      targetId: plant.plantId,
    });
    this.movement.start(path, target, () => {
      if (this.isDestroyed || generation !== this.requestGeneration) {
        return;
      }

      if (!this.plants.hasPlant(plant.plantId)) {
        this.failMovement("plant_unavailable", plant.plantId, targetWorldPosition);
        return;
      }

      this.finishRequest();
      this.bridge.publishToReact({
        type: "PLAYER_REACHED_PLANT",
        plantId: plant.plantId,
      });
    });
  }

  handlePlantDataChanged(): void {
    const activePlantId = this.activePlantId;

    if (activePlantId !== null && !this.plants.hasPlant(activePlantId)) {
      this.failMovement("plant_unavailable", activePlantId, this.movement.position);
    }
  }

  reportUnexpectedFailure(targetPlantId?: string): void {
    const failedPlantId = targetPlantId ?? this.activePlantId ?? undefined;
    this.failMovement(
      failedPlantId === undefined ? "path_not_found" : "plant_unavailable",
      failedPlantId,
      this.movement.position,
    );
  }

  cancelInteraction(): void {
    if (this.isDestroyed) {
      return;
    }

    this.requestGeneration += 1;
    this.failureMarkerTimer?.remove(false);
    this.failureMarkerTimer = null;
    this.movement.stop();
    this.activePlantId = null;
    this.plants.setSelectedPlant(null);
    this.onSelectedPlantChange(null);
    this.targetMarker.setVisible(false);
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.requestGeneration += 1;
    this.failureMarkerTimer?.remove(false);
    this.failureMarkerTimer = null;
    this.movement.destroy();
    this.plants.setSelectedPlant(null);
    this.onSelectedPlantChange(null);
    this.targetMarker.destroy();
  }

  private beginRequest(plantId: string | null): number {
    this.requestGeneration += 1;
    this.failureMarkerTimer?.remove(false);
    this.failureMarkerTimer = null;
    this.movement.stop();
    this.activePlantId = plantId;
    this.plants.setSelectedPlant(plantId);
    this.onSelectedPlantChange(plantId);
    return this.requestGeneration;
  }

  private finishRequest(): void {
    this.activePlantId = null;
    this.plants.setSelectedPlant(null);
    this.onSelectedPlantChange(null);
    this.targetMarker.setVisible(false);
  }

  private failMovement(
    reason: MovementFailureReason,
    targetId: string | undefined,
    markerPosition: WorldPosition,
  ): void {
    if (this.isDestroyed) {
      return;
    }

    this.requestGeneration += 1;
    this.movement.stop();
    this.activePlantId = null;
    this.plants.setSelectedPlant(null);
    this.onSelectedPlantChange(null);
    this.showFailureMarker(markerPosition);
    this.bridge.publishToReact({
      type: "MOVEMENT_FAILED",
      reason,
      ...(targetId === undefined ? {} : { targetId }),
    });
  }

  private showTargetMarker(position: WorldPosition): void {
    this.failureMarkerTimer?.remove(false);
    this.failureMarkerTimer = null;
    this.targetMarker
      .setPosition(position.x, position.y)
      .setFillStyle(GARDEN_RENDER_COLORS.movementTarget, 0.12)
      .setStrokeStyle(3, GARDEN_RENDER_COLORS.movementTarget, 0.95)
      .setVisible(true);
  }

  private showFailureMarker(position: WorldPosition): void {
    this.targetMarker
      .setPosition(position.x, position.y)
      .setFillStyle(GARDEN_RENDER_COLORS.movementFailure, 0.15)
      .setStrokeStyle(3, GARDEN_RENDER_COLORS.movementFailure, 0.95)
      .setVisible(true);
    this.failureMarkerTimer?.remove(false);
    this.failureMarkerTimer = this.scene.time.delayedCall(FAILURE_MARKER_DURATION_MS, () => {
      this.targetMarker.setVisible(false);
      this.failureMarkerTimer = null;
    });
  }
}
