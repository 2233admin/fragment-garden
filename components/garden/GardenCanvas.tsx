"use client";

import { useEffect, useRef, useState } from "react";

import type { PlantViewModel } from "@/domain";
import { GameBridge } from "@/game/bridge/game-bridge";
import type { GardenGameRuntime, GardenRuntimeFailure } from "@/game/start-garden-game";

import { GardenErrorState, type GardenErrorKind } from "./GardenErrorState";
import { GardenLoadingState } from "./GardenLoadingState";

type GardenCanvasProps = {
  plants: readonly PlantViewModel[];
  onShowCards: () => void;
};

type RuntimeState =
  { status: "loading" } | { status: "ready" } | { status: "error"; kind: GardenErrorKind };

const LOADING_RUNTIME_STATE: RuntimeState = { status: "loading" };

export function GardenCanvas({ plants, onShowCards }: GardenCanvasProps) {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>(LOADING_RUNTIME_STATE);
  const [runtimeAttempt, setRuntimeAttempt] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  const runtimeRef = useRef<GardenGameRuntime | null>(null);
  const latestPlantsRef = useRef(plants);
  const isSceneReadyRef = useRef(false);
  const failureHandlerRef = useRef<((kind: GardenRuntimeFailure) => void) | null>(null);

  useEffect(() => {
    latestPlantsRef.current = plants;
  }, [plants]);

  useEffect(() => {
    const host = hostRef.current;

    if (host === null) {
      return;
    }

    const runtimeHost = host;
    let isCancelled = false;
    let didFail = false;
    const bridge = new GameBridge();
    bridgeRef.current = bridge;
    isSceneReadyRef.current = false;
    runtimeHost.replaceChildren();
    setRuntimeState(LOADING_RUNTIME_STATE);

    function destroyRuntime(): void {
      isSceneReadyRef.current = false;
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
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
          onReady: () => {
            if (isCancelled || didFail) {
              return;
            }

            isSceneReadyRef.current = true;
            const canvas = runtimeHost.querySelector("canvas");
            canvas?.setAttribute("aria-hidden", "true");
            bridge.publish({
              type: "LOAD_GARDEN",
              plants: [...latestPlantsRef.current],
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
      bridgeRef.current?.publish({
        type: "LOAD_GARDEN",
        plants: [...plants],
      });
    } catch {
      failureHandlerRef.current?.("update");
    }
  }, [plants]);

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
      className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl border border-garden-line bg-garden-paper shadow-[0_18px_45px_rgba(37,72,56,0.14)]"
      data-plant-count={plants.length}
      data-testid="garden-canvas-host"
    >
      <div
        aria-label={`固定花园场景，当前有 ${plants.length} 株已放置植物`}
        className="absolute inset-0 [&_canvas]:block [&_canvas]:max-h-full [&_canvas]:max-w-full"
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
