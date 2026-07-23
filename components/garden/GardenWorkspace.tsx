"use client";

import { Activity, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { FragmentDetailDialog } from "@/components/fragments/FragmentDetailDialog";
import { FragmentWorkspace } from "@/components/fragments/FragmentWorkspace";
import type { GardenPlantSnapshot } from "@/domain";
import type { GardenInteractionEvent } from "@/game/bridge/game-events";
import { queryGardenPlantSnapshot } from "@/services/garden-query-service";
import { recordFragmentViewed } from "@/services/record-fragment-viewed";

import { GardenAccessibilitySummary } from "./GardenAccessibilitySummary";
import { GardenCanvas } from "./GardenCanvas";
import { resolveGardenEventResponse } from "./garden-event-response";
import { GardenErrorState } from "./GardenErrorState";
import { GardenLoadingState } from "./GardenLoadingState";
import { GardenModeToggle, type GardenMode } from "./GardenModeToggle";

type GardenQueryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; snapshot: GardenPlantSnapshot };

type InteractionFeedback = Readonly<{
  kind: "status" | "error";
  message: string;
}>;

type OpenFragmentOptions = Readonly<{
  plantId?: string;
  successMessage?: string;
  triggerElement: HTMLButtonElement | null;
}>;

const LOADING_GARDEN_STATE: GardenQueryState = { status: "loading" };

export function GardenWorkspace() {
  const [mode, setMode] = useState<GardenMode>("garden");
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);
  const [openingFragmentId, setOpeningFragmentId] = useState<string | null>(null);
  const [openingPlantId, setOpeningPlantId] = useState<string | null>(null);
  const [cancelInteractionRequest, setCancelInteractionRequest] = useState(0);
  const [interactionFeedback, setInteractionFeedback] = useState<InteractionFeedback | null>(null);
  const selectedFragmentIdRef = useRef<string | null>(null);
  const openingLockRef = useRef<string | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gardenModeButtonRef = useRef<HTMLButtonElement>(null);
  const cardModeButtonRef = useRef<HTMLButtonElement>(null);

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

  function restoreDetailFocus(): void {
    const preferredTarget = detailTriggerRef.current;
    const fallbackTarget =
      mode === "garden" ? gardenModeButtonRef.current : cardModeButtonRef.current;

    requestAnimationFrame(() => {
      if (
        preferredTarget?.isConnected &&
        preferredTarget.offsetParent !== null &&
        !preferredTarget.disabled
      ) {
        preferredTarget.focus();
      } else {
        fallbackTarget?.focus();
      }
    });
  }

  async function openFragment(
    fragmentId: string,
    { plantId, successMessage, triggerElement }: OpenFragmentOptions,
  ): Promise<void> {
    if (openingLockRef.current !== null || selectedFragmentIdRef.current !== null) {
      return;
    }

    openingLockRef.current = fragmentId;
    detailTriggerRef.current = triggerElement;
    setOpeningFragmentId(fragmentId);
    setOpeningPlantId(plantId ?? null);
    setInteractionFeedback({
      kind: "status",
      message: "正在打开碎片详情…",
    });

    try {
      await recordFragmentViewed({ fragmentId });
      selectedFragmentIdRef.current = fragmentId;
      setSelectedFragmentId(fragmentId);
      setInteractionFeedback(
        successMessage === undefined ? null : { kind: "status", message: successMessage },
      );
    } catch {
      setInteractionFeedback({
        kind: "error",
        message: "详情打开失败，没有写入查看记录，也没有修改本地内容。请重试。",
      });
    } finally {
      openingLockRef.current = null;
      setOpeningFragmentId(null);
      setOpeningPlantId(null);
    }
  }

  function openPlant(
    plantId: string,
    triggerElement: HTMLButtonElement | null,
    successMessage?: string,
  ): void {
    const plant =
      gardenState.status === "ready"
        ? gardenState.snapshot.plants.find((candidate) => candidate.plantId === plantId)
        : undefined;

    if (plant === undefined) {
      setInteractionFeedback({
        kind: "error",
        message: "这株植物已不在当前花园中，没有打开其他碎片。",
      });
      return;
    }

    void openFragment(plant.fragmentId, {
      plantId,
      successMessage,
      triggerElement,
    });
  }

  function handleGameEvent(event: GardenInteractionEvent): void {
    const response = resolveGardenEventResponse(
      event,
      gardenState.status === "ready" ? gardenState.snapshot.plants : [],
    );

    if (response.type === "open_fragment") {
      void openFragment(response.fragmentId, {
        plantId: response.plantId,
        successMessage: response.successMessage,
        triggerElement: null,
      });
      return;
    }

    setInteractionFeedback({
      kind: response.type,
      message: response.message,
    });
  }

  function handleModeChange(nextMode: GardenMode): void {
    setMode(nextMode);
    setInteractionFeedback(
      nextMode === "cards"
        ? {
            kind: "status",
            message: "已切换到卡片模式，花园移动已停止。",
          }
        : null,
    );
  }

  function openPlantFromAccessibleList(plantId: string, triggerElement: HTMLButtonElement): void {
    setCancelInteractionRequest((request) => request + 1);
    openPlant(plantId, triggerElement);
  }

  function closeDetailDialog(): void {
    selectedFragmentIdRef.current = null;
    setSelectedFragmentId(null);
    restoreDetailFocus();
  }

  function handleDeleted(): void {
    selectedFragmentIdRef.current = null;
    setSelectedFragmentId(null);
    setInteractionFeedback({
      kind: "status",
      message: "碎片已移除，对应植物也已从当前花园中消失。",
    });
    restoreDetailFocus();
  }

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
              点击花园地面让人物移动，或点击植物走近并查看内容；卡片模式仍可直接记录和整理。
            </p>
          </div>
          <GardenModeToggle
            cardButtonRef={cardModeButtonRef}
            gardenButtonRef={gardenModeButtonRef}
            mode={mode}
            onModeChange={handleModeChange}
          />
        </header>

        <div
          aria-atomic="true"
          aria-live={interactionFeedback?.kind === "error" ? "assertive" : "polite"}
          className={`mx-auto mt-4 min-h-6 max-w-[960px] text-sm font-semibold ${
            interactionFeedback?.kind === "error" ? "text-garden-danger" : "text-garden-accent"
          }`}
          data-testid="garden-interaction-status"
          role={interactionFeedback?.kind === "error" ? "alert" : "status"}
        >
          {interactionFeedback?.message}
        </div>

        <Activity mode={mode === "garden" ? "visible" : "hidden"}>
          <section aria-labelledby="garden-mode-title" className="pt-3" id="garden-mode-panel">
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
              <p className="text-xs text-garden-muted">点击地面移动 · 点击植物查看</p>
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
                  onShowCards={() => handleModeChange("cards")}
                />
              </div>
            ) : null}

            {gardenState.status === "ready" ? (
              <div className="mx-auto max-w-[960px] space-y-4">
                <GardenCanvas
                  cancelInteractionRequest={cancelInteractionRequest}
                  onGameEvent={handleGameEvent}
                  onShowCards={() => handleModeChange("cards")}
                  plants={gardenState.snapshot.plants}
                />
                <GardenAccessibilitySummary
                  onOpenPlant={openPlantFromAccessibleList}
                  openingPlantId={openingPlantId}
                  snapshot={gardenState.snapshot}
                />
              </div>
            ) : null}
          </section>
        </Activity>

        <Activity mode={mode === "cards" ? "visible" : "hidden"}>
          <section aria-label="卡片模式" id="cards-mode-panel">
            <FragmentWorkspace
              layout="embedded"
              onOpenFragment={(fragmentId, triggerElement) => {
                void openFragment(fragmentId, { triggerElement });
              }}
              openingFragmentId={openingFragmentId}
            />
          </section>
        </Activity>
      </div>

      {selectedFragmentId !== null ? (
        <FragmentDetailDialog
          fragmentId={selectedFragmentId}
          key={selectedFragmentId}
          onClose={closeDetailDialog}
          onDeleted={handleDeleted}
        />
      ) : null}
    </main>
  );
}
