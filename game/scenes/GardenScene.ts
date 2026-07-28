import * as Phaser from "phaser";

import type { GameBridge, UnsubscribeGameBridge } from "../bridge/game-bridge";
import type { ReactToGameEvent } from "../bridge/game-events";
import type { PlantViewModel } from "../../domain";
import type { GardenGrowthStage } from "../../domain/garden/garden-growth";
import type { ContentPlantPreviewMode } from "../config/content-plant-preview";
import { GARDEN_MAP_CONFIG } from "../config/garden-map";
import { GARDEN_SCENE_KEY } from "../config/game-config";
import { PlayerSprite } from "../entities/PlayerSprite";
import { CompanionRenderSystem } from "../systems/CompanionRenderSystem";
import { GardenGrowthSystem } from "../systems/GardenGrowthSystem";
import { GardenMapRenderer } from "../systems/GardenMapRenderer";
import { InteractionSystem } from "../systems/InteractionSystem";
import { MovementSystem, type MovementSnapshot } from "../systems/MovementSystem";
import { PathfindingSystem } from "../systems/PathfindingSystem";
import { PlantRenderSystem } from "../systems/PlantRenderSystem";

type RuntimeFailureHandler = (kind: "initialize" | "update") => void;

export class GardenScene extends Phaser.Scene {
  private companionRenderSystem: CompanionRenderSystem | null = null;
  private gardenGrowthSystem: GardenGrowthSystem | null = null;
  private plantRenderSystem: PlantRenderSystem | null = null;
  private pathfindingSystem: PathfindingSystem | null = null;
  private movementSystem: MovementSystem | null = null;
  private interactionSystem: InteractionSystem | null = null;
  private player: PlayerSprite | null = null;
  private unsubscribeBridge: UnsubscribeGameBridge | null = null;
  private movementSnapshot: MovementSnapshot = {
    x: GARDEN_MAP_CONFIG.playerSpawn.x,
    y: GARDEN_MAP_CONFIG.playerSpawn.y,
    state: "idle",
  };
  private selectedPlantId: string | null = null;
  private isDisposed = false;

  constructor(
    private readonly bridge: GameBridge,
    private readonly onReady: () => void,
    private readonly onFailure: RuntimeFailureHandler,
    private readonly gardenStagePreview: GardenGrowthStage | null,
    private readonly contentPlantPreview: ContentPlantPreviewMode | null,
  ) {
    super(GARDEN_SCENE_KEY);
  }

  create(): void {
    try {
      const mapRenderResult = new GardenMapRenderer(this, GARDEN_MAP_CONFIG).render();
      this.gardenGrowthSystem = new GardenGrowthSystem(
        mapRenderResult.growthLayers,
        this.gardenStagePreview,
      );
      this.gardenGrowthSystem.update([]);
      this.player = new PlayerSprite(
        this,
        GARDEN_MAP_CONFIG.playerSpawn.x,
        GARDEN_MAP_CONFIG.playerSpawn.y,
      );
      this.pathfindingSystem = new PathfindingSystem(GARDEN_MAP_CONFIG);
      this.plantRenderSystem = new PlantRenderSystem(
        this,
        (plant) => this.handlePlantClicked(plant),
        this.contentPlantPreview,
      );
      this.companionRenderSystem = new CompanionRenderSystem(
        this,
        GARDEN_MAP_CONFIG.companionPosition,
        () => this.handleCompanionClicked(),
      );
      this.movementSystem = new MovementSystem(this.player, this.pathfindingSystem, (snapshot) => {
        this.movementSnapshot = snapshot;
        this.publishPlayerState();
      });
      this.interactionSystem = new InteractionSystem(
        this,
        GARDEN_MAP_CONFIG,
        this.bridge,
        this.pathfindingSystem,
        this.movementSystem,
        this.plantRenderSystem,
        (plantId) => {
          this.selectedPlantId = plantId;
          this.publishPlayerState();
        },
      );
      this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleGroundPointer, this);
      this.unsubscribeBridge = this.bridge.subscribeToGame((event) =>
        this.handleBridgeEvent(event),
      );
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, this.dispose, this);
      this.publishPlayerState();
      this.onReady();
    } catch {
      this.onFailure("initialize");
    }
  }

  update(_time: number, delta: number): void {
    try {
      this.movementSystem?.update(delta);
    } catch {
      this.interactionSystem?.reportUnexpectedFailure();
    }
  }

  private handleBridgeEvent(event: ReactToGameEvent): void {
    try {
      if (event.type === "CANCEL_INTERACTION") {
        this.interactionSystem?.cancelInteraction();
        return;
      }

      if (event.type === "SET_COMPANION") {
        const companionRenderSystem = this.companionRenderSystem;

        if (companionRenderSystem === null) {
          throw new Error("Companion render system is not ready");
        }

        companionRenderSystem.setCompanion(event.companion);
        return;
      }

      const renderSystem = this.plantRenderSystem;

      if (renderSystem === null) {
        throw new Error("Plant render system is not ready");
      }

      switch (event.type) {
        case "LOAD_GARDEN":
          renderSystem.loadGarden(event.plants);
          break;
        case "ADD_PLANT":
        case "UPDATE_PLANT":
          renderSystem.addOrUpdatePlant(event.plant);
          break;
        case "REMOVE_PLANT":
          renderSystem.removePlant(event.plantId);
          break;
      }

      this.pathfindingSystem?.setOccupiedPlantSlots(renderSystem.getOccupiedSlotIds());
      this.gardenGrowthSystem?.update(renderSystem.getPlants());
      this.interactionSystem?.handlePlantDataChanged();
    } catch {
      this.onFailure("update");
    }
  }

  private handleGroundPointer(pointer: Phaser.Input.Pointer): void {
    if (!pointer.leftButtonDown()) {
      return;
    }

    try {
      this.interactionSystem?.moveToGround({
        x: pointer.worldX,
        y: pointer.worldY,
      });
    } catch {
      this.interactionSystem?.reportUnexpectedFailure();
    }
  }

  private handlePlantClicked(plant: PlantViewModel): void {
    try {
      this.interactionSystem?.moveToPlant(plant);
    } catch {
      this.interactionSystem?.reportUnexpectedFailure(plant.plantId);
    }
  }

  private handleCompanionClicked(): void {
    if (this.isDisposed) {
      return;
    }

    this.interactionSystem?.cancelInteraction();
    this.bridge.publishToReact({ type: "COMPANION_CLICKED" });
  }

  private publishPlayerState(): void {
    if (this.isDisposed) {
      return;
    }

    this.bridge.publishToReact({
      type: "PLAYER_STATE_CHANGED",
      playerX: this.movementSnapshot.x,
      playerY: this.movementSnapshot.y,
      movementState: this.movementSnapshot.state,
      selectedPlantId: this.selectedPlantId,
    });
  }

  private dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleGroundPointer, this);
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = null;
    this.interactionSystem?.destroy();
    this.interactionSystem = null;
    this.movementSystem = null;
    this.pathfindingSystem = null;
    this.gardenGrowthSystem = null;
    this.companionRenderSystem?.destroy();
    this.companionRenderSystem = null;
    this.plantRenderSystem?.destroy();
    this.plantRenderSystem = null;
    this.player = null;
  }
}
