import * as Phaser from "phaser";

import type { GameBridge, UnsubscribeGameBridge } from "../bridge/game-bridge";
import type { ReactToGameEvent } from "../bridge/game-events";
import { GARDEN_MAP_CONFIG } from "../config/garden-map";
import { GARDEN_SCENE_KEY } from "../config/game-config";
import { PlayerSprite } from "../entities/PlayerSprite";
import { GardenMapRenderer } from "../systems/GardenMapRenderer";
import { PlantRenderSystem } from "../systems/PlantRenderSystem";

type RuntimeFailureHandler = (kind: "initialize" | "update") => void;

export class GardenScene extends Phaser.Scene {
  private plantRenderSystem: PlantRenderSystem | null = null;
  private unsubscribeBridge: UnsubscribeGameBridge | null = null;

  constructor(
    private readonly bridge: GameBridge,
    private readonly onReady: () => void,
    private readonly onFailure: RuntimeFailureHandler,
  ) {
    super(GARDEN_SCENE_KEY);
  }

  create(): void {
    try {
      new GardenMapRenderer(this, GARDEN_MAP_CONFIG).render();
      new PlayerSprite(this, GARDEN_MAP_CONFIG.playerSpawn.x, GARDEN_MAP_CONFIG.playerSpawn.y);
      this.plantRenderSystem = new PlantRenderSystem(this);
      this.unsubscribeBridge = this.bridge.subscribe((event) => this.handleBridgeEvent(event));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.dispose, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, this.dispose, this);
      this.onReady();
    } catch {
      this.onFailure("initialize");
    }
  }

  private handleBridgeEvent(event: ReactToGameEvent): void {
    try {
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
    } catch {
      this.onFailure("update");
    }
  }

  private dispose(): void {
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = null;
    this.plantRenderSystem?.destroy();
    this.plantRenderSystem = null;
  }
}
