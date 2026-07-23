import * as Phaser from "phaser";

import type { GameBridge } from "./bridge/game-bridge";
import { GARDEN_MAP_CONFIG } from "./config/garden-map";
import { GARDEN_RENDER_COLORS } from "./config/game-config";
import { BootScene } from "./scenes/BootScene";
import { GardenScene } from "./scenes/GardenScene";

export type GardenRuntimeFailure = "initialize" | "update";

export type StartGardenGameOptions = {
  parent: HTMLElement;
  bridge: GameBridge;
  onReady: () => void;
  onFailure: (kind: GardenRuntimeFailure) => void;
};

export type GardenGameRuntime = {
  destroy: () => void;
};

export function startGardenGame({
  parent,
  bridge,
  onReady,
  onFailure,
}: StartGardenGameOptions): GardenGameRuntime {
  let game: Phaser.Game | null = null;

  try {
    game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      width: GARDEN_MAP_CONFIG.width,
      height: GARDEN_MAP_CONFIG.height,
      backgroundColor: GARDEN_RENDER_COLORS.background,
      banner: false,
      audio: {
        noAudio: true,
      },
      render: {
        antialias: true,
        roundPixels: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GARDEN_MAP_CONFIG.width,
        height: GARDEN_MAP_CONFIG.height,
      },
      scene: [new BootScene(onFailure), new GardenScene(bridge, onReady, onFailure)],
    });
  } catch (error) {
    game?.destroy(true);
    throw error;
  }

  let isDestroyed = false;

  return {
    destroy(): void {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      game?.destroy(true);
      game = null;
    },
  };
}
