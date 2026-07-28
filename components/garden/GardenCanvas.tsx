"use client";

import { useEffect, useRef, useState } from "react";

import type { PlantViewModel } from "@/domain";
import type { CompanionViewModel } from "@/domain/garden/companion-view-model";
import { GameBridge } from "@/game/bridge/game-bridge";
import type { GardenInteractionEvent } from "@/game/bridge/game-events";
import {
  getContentPlantPreviewPlants,
  resolveContentPlantPreview,
  type ContentPlantPreviewMode,
} from "@/game/config/content-plant-preview";
import { GARDEN_MAP_CONFIG } from "@/game/config/garden-map";
import { resolveGardenStagePreview } from "@/game/config/garden-stage-preview";
import type { GardenGameRuntime, GardenRuntimeFailure } from "@/game/start-garden-game";

import { GardenErrorState, type GardenErrorKind } from "./GardenErrorState";
import { GardenLoadingState } from "./GardenLoadingState";

type GardenCanvasProps = {
  plants: readonly PlantViewModel[];
  companion: CompanionViewModel | null;
  cancelInteractionRequest: number;
  onGameEvent: (event: GardenInteractionEvent) => void;
  onShowCards: () => void;
};

type RuntimeState =
  { status: "loading" } | { status: "ready" } | { status: "error"; kind: GardenErrorKind };

const LOADING_RUNTIME_STATE: RuntimeState = { status: "loading" };

export function GardenCanvas({
  plants,
  companion,
  cancelInteractionRequest,
  onGameEvent,
  onShowCards,
}: GardenCanvasProps) {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(LOADING_RUNTIME_STATE);
  const [runtimeAttempt, setRuntimeAttempt] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  const runtimeRef = useRef<GardenGameRuntime | null>(null);
  const latestPlantsRef = useRef(plants);
  const latestCompanionRef = useRef(companion);
  const contentPlantPreviewRef = useRef<ContentPlantPreviewMode | null>(null);
  const isSceneReadyRef = useRef(false);
  const failureHandlerRef = useRef<((kind: GardenRuntimeFailure) => void) | null>(null);
  const gameEventHandlerRef = useRef(onGameEvent);
  const handledCancelRequestRef = useRef(0);

  useEffect(() => {
    latestPlantsRef.current = plants;
  }, [plants]);

  useEffect(() => {
    latestCompanionRef.current = companion;
  }, [companion]);

  useEffect(() => {
    gameEventHandlerRef.current = onGameEvent;
  }, [onGameEvent]);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return;
    }

    const runtimeHost = host;
    const container = containerRef.current;
    const gardenStagePreview = resolveGardenStagePreview(
      window.location.search,
      process.env.NODE_ENV,
    );
    const contentPlantPreview = resolveContentPlantPreview(
      window.location.search,
      process.env.NODE_ENV,
    );
    contentPlantPreviewRef.current = contentPlantPreview;
    let isCancelled = false;
    let didFail = false;
    const bridge = new GameBridge();
    const unsubscribeGameEvents = bridge.subscribeToReact((event) => {
      if (event.type === "PLAYER_STATE_CHANGED") {
        const currentContainer = containerRef.current;

        if (currentContainer !== null) {
          currentContainer.dataset.playerX = event.playerX.toFixed(2);
          currentContainer.dataset.playerY = event.playerY.toFixed(2);
          currentContainer.dataset.movementState = event.movementState;

          if (event.selectedPlantId === null) {
            delete currentContainer.dataset.selectedPlantId;
          } else {
            currentContainer.dataset.selectedPlantId = event.selectedPlantId;
          }
        }
        return;
      }

      gameEventHandlerRef.current(event);
    });
    bridgeRef.current = bridge;
    isSceneReadyRef.current = false;
    runtimeHost.replaceChildren();
    if (container !== null) {
      container.dataset.playerX = GARDEN_MAP_CONFIG.playerSpawn.x.toFixed(2);
      container.dataset.playerY = GARDEN_MAP_CONFIG.playerSpawn.y.toFixed(2);
      container.dataset.movementState = "idle";
      if (gardenStagePreview === null) {
        delete container.dataset.gardenStagePreview;
      } else {
        container.dataset.gardenStagePreview = String(gardenStagePreview);
      }
      if (contentPlantPreview === null) {
        delete container.dataset.contentPlantPreview;
      } else {
        container.dataset.contentPlantPreview = contentPlantPreview;
      }
      delete container.dataset.selectedPlantId;
    }
    setRuntimeState(LOADING_RUNTIME_STATE);

    function destroyRuntime(): void {
      isSceneReadyRef.current = false;
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      unsubscribeGameEvents();
      bridge.destroy();

      if (bridgeRef.current === bridge) {
        bridgeRef.current = null;
      }

      runtimeHost.replaceChildren();
    }

    function failRuntime(kind: GardenRuntimeFailure | "load"): void {
      if (isCancelled || didFail) {
        return;
      }

      didFail = true;
      console.error("Garden runtime failed.", { kind });
      destroyRuntime();
      setRuntimeState({ status: "error", kind });
    }

    failureHandlerRef.current = failRuntime;

    void (async () => {
      try {
        const { startGardenGame } = await import("@/game/start-garden-game");

        if (isCancelled) {
          return;
        }

        const runtime = startGardenGame({
          parent: runtimeHost,
          bridge,
          gardenStagePreview,
          contentPlantPreview,
          onReady: () => {
            if (isCancelled || didFail) {
              return;
            }

            isSceneReadyRef.current = true;
            const canvas = runtimeHost.querySelector("canvas");
            canvas?.setAttribute("aria-hidden", "true");
            bridge.publishToGame({
              type: "LOAD_GARDEN",
              plants:
                contentPlantPreview === null
                  ? [...latestPlantsRef.current]
                  : [...getContentPlantPreviewPlants(contentPlantPreview)],
            });
            bridge.publishToGame({
              type: "SET_COMPANION",
              companion: latestCompanionRef.current,
            });

            if (isCancelled || didFail) {
              return;
            }

            setRuntimeState({ status: "ready" });
          },
          onFailure: failRuntime,
        });

        if (isCancelled || didFail) {
          runtime.destroy();
          return;
        }

        runtimeRef.current = runtime;
      } catch {
        failRuntime("load");
      }
    })();

    return () => {
      isCancelled = true;
      failureHandlerRef.current = null;
      destroyRuntime();
    };
  }, [runtimeAttempt]);

  useEffect(() => {
    if (!isSceneReadyRef.current) {
      return;
    }

    try {
      const contentPlantPreview = contentPlantPreviewRef.current;
      bridgeRef.current?.publishToGame({
        type: "LOAD_GARDEN",
        plants:
          contentPlantPreview === null
            ? [...plants]
            : [...getContentPlantPreviewPlants(contentPlantPreview)],
      });
    } catch {
      failureHandlerRef.current?.("update");
    }
  }, [plants]);

  useEffect(() => {
    if (!isSceneReadyRef.current) {
      return;
    }

    try {
      bridgeRef.current?.publishToGame({
        type: "SET_COMPANION",
        companion,
      });
    } catch {
      failureHandlerRef.current?.("update");
    }
  }, [companion]);

  useEffect(() => {
    if (cancelInteractionRequest <= handledCancelRequestRef.current) {
      return;
    }

    handledCancelRequestRef.current = cancelInteractionRequest;

    if (!isSceneReadyRef.current) {
      return;
    }

    try {
      bridgeRef.current?.publishToGame({ type: "CANCEL_INTERACTION" });
    } catch {
      failureHandlerRef.current?.("update");
    }
  }, [cancelInteractionRequest]);

  function retryRuntime(): void {
    setRuntimeState(LOADING_RUNTIME_STATE);
    setRuntimeAttempt((attempt) => attempt + 1);
  }

  if (runtimeState.status === "error") {
    return (
      <GardenErrorState kind={runtimeState.kind} onRetry={retryRuntime} onShowCards={onShowCards} />
    );
  }

  return (
    <div
      aria-busy={runtimeState.status === "loading"}
      className="garden-canvas-frame relative aspect-[3/2] w-full overflow-hidden bg-garden-paper"
      data-companion-count={companion === null ? 0 : 1}
      data-companion-type={companion?.type}
      data-plant-count={plants.length}
      data-player-x={GARDEN_MAP_CONFIG.playerSpawn.x.toFixed(2)}
      data-player-y={GARDEN_MAP_CONFIG.playerSpawn.y.toFixed(2)}
      data-movement-state="idle"
      data-testid="garden-canvas-host"
      ref={containerRef}
    >
      <div
        aria-label={`花园画面。可以点击地面移动人物，点击植物走近并查看内容。当前有 ${plants.length} 株已放置植物。${
          companion === null ? "尚未选择花园伙伴。" : "可以点击花园伙伴打开规则型对话。"
        }`}
        className="pixel-garden-canvas absolute inset-0 [&_canvas]:block [&_canvas]:max-h-full [&_canvas]:max-w-full"
        ref={hostRef}
        role="img"
      />
      {runtimeState.status === "loading" ? (
        <div className="absolute inset-0">
          <GardenLoadingState phase="runtime" />
        </div>
      ) : null}
    </div>
  );
}
