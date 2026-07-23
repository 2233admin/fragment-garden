"use client";

import { Activity, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { FragmentWorkspace } from "@/components/fragments/FragmentWorkspace";
import type { GardenPlantSnapshot } from "@/domain";
import { queryGardenPlantSnapshot } from "@/services/garden-query-service";

import { GardenAccessibilitySummary } from "./GardenAccessibilitySummary";
import { GardenCanvas } from "./GardenCanvas";
import { GardenErrorState } from "./GardenErrorState";
import { GardenLoadingState } from "./GardenLoadingState";
import { GardenModeToggle, type GardenMode } from "./GardenModeToggle";

type GardenQueryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; snapshot: GardenPlantSnapshot };

const LOADING_GARDEN_STATE: GardenQueryState = { status: "loading" };

export function GardenWorkspace() {
  const [mode, setMode] = useState<GardenMode>("garden");
  const [queryAttempt, setQueryAttempt] = useState(0);

  const gardenState: GardenQueryState = useLiveQuery(
    async (): Promise<GardenQueryState> => {
      try {
        return {
          status: "ready",
          snapshot: await queryGardenPlantSnapshot(),
        };
      } catch {
        return { status: "error" };
      }
    },
    [queryAttempt],
    LOADING_GARDEN_STATE,
  );

  return (
    <main className="min-h-screen px-5 py-8 text-garden-ink sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-6 border-b border-garden-line pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-garden-accent uppercase">
              本地碎片花园
            </p>
            <h1 className="mt-2 font-display text-4xl leading-tight font-semibold tracking-tight text-garden-ink sm:text-5xl">
              碎片花园
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-garden-muted sm:text-base">
              在固定花园里查看积累，或切回卡片模式继续记录与整理。当前场景只用于查看。
            </p>
          </div>
          <GardenModeToggle mode={mode} onModeChange={setMode} />
        </header>

        <Activity mode={mode === "garden" ? "visible" : "hidden"}>
          <section aria-labelledby="garden-mode-title" className="pt-7" id="garden-mode-panel">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
                  花园模式
                </p>
                <h2
                  className="mt-1 font-display text-2xl font-semibold text-garden-ink"
                  id="garden-mode-title"
                >
                  固定花园
                </h2>
              </div>
              <p className="text-xs text-garden-muted">静态查看 · 互动将在后续阶段加入</p>
            </div>

            {gardenState.status === "loading" ? (
              <div className="mx-auto aspect-[3/2] max-w-[960px] overflow-hidden rounded-2xl border border-garden-line">
                <GardenLoadingState phase="data" />
              </div>
            ) : null}

            {gardenState.status === "error" ? (
              <div className="mx-auto max-w-[960px]">
                <GardenErrorState
                  kind="data"
                  onRetry={() => setQueryAttempt((attempt) => attempt + 1)}
                  onShowCards={() => setMode("cards")}
                />
              </div>
            ) : null}

            {gardenState.status === "ready" ? (
              <div className="mx-auto max-w-[960px] space-y-4">
                <GardenAccessibilitySummary snapshot={gardenState.snapshot} />
                <GardenCanvas
                  onShowCards={() => setMode("cards")}
                  plants={gardenState.snapshot.plants}
                />
              </div>
            ) : null}
          </section>
        </Activity>

        <Activity mode={mode === "cards" ? "visible" : "hidden"}>
          <section aria-label="卡片模式" id="cards-mode-panel">
            <FragmentWorkspace layout="embedded" />
          </section>
        </Activity>
      </div>
    </main>
  );
}
