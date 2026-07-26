"use client";

import { Activity, useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { DataBackupDialog } from "@/components/backup/DataBackupDialog";
import { CompanionExperience } from "@/components/companion/CompanionExperience";
import { ContentProcessingDialog } from "@/components/content-processing/ContentProcessingDialog";
import { ContentProcessingIndicator } from "@/components/content-processing/ContentProcessingIndicator";
import { useContentProcessingRuntime } from "@/components/content-processing/useContentProcessingRuntime";
import { FragmentDetailDialog } from "@/components/fragments/FragmentDetailDialog";
import { FragmentWorkspace } from "@/components/fragments/FragmentWorkspace";
import { useDormancySync } from "@/components/fragments/useDormancySync";
import { useExternalLinkImportRuntime } from "@/components/link-imports/useExternalLinkImportRuntime";
import { fragmentGardenDb } from "@/data/db";
import type { GardenPlantSnapshot } from "@/domain";
import type { GardenSummary } from "@/domain/companion/context-builder";
import type { CompanionViewModel } from "@/domain/garden/companion-view-model";
import type { GardenInteractionEvent } from "@/game/bridge/game-events";
import { queryGardenPlantSnapshot, queryGardenSummary } from "@/services/garden-query-service";
import {
  RESTORE_COMPLETED_SESSION_KEY,
  subscribeToGardenRestoreEvents,
} from "@/services/garden-restore-coordination";
import { recordFragmentViewed } from "@/services/record-fragment-viewed";

import { GardenAccessibilitySummary } from "./GardenAccessibilitySummary";
import { GardenCanvas } from "./GardenCanvas";
import { resolveGardenEventResponse } from "./garden-event-response";
import { GardenErrorState } from "./GardenErrorState";
import { GardenLoadingState } from "./GardenLoadingState";
import { GardenModeToggle, type GardenMode } from "./GardenModeToggle";

type GardenQueryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; snapshot: GardenPlantSnapshot };
type GardenSummaryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; summary: GardenSummary };

type InteractionFeedback = Readonly<{
  kind: "status" | "error";
  message: string;
}>;

type OpenFragmentOptions = Readonly<{
  plantId?: string;
  replaceSelected?: boolean;
  reopenCompanionOnClose?: boolean;
  successMessage?: string;
  triggerElement: HTMLButtonElement | null;
  viewAlreadyRecorded?: boolean;
}>;

const LOADING_GARDEN_STATE: GardenQueryState = { status: "loading" };
const LOADING_GARDEN_SUMMARY: GardenSummaryState = { status: "loading" };

export function GardenWorkspace() {
  const [mode, setMode] = useState<GardenMode>("garden");
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);
  const [openingFragmentId, setOpeningFragmentId] = useState<string | null>(null);
  const [openingPlantId, setOpeningPlantId] = useState<string | null>(null);
  const [cancelInteractionRequest, setCancelInteractionRequest] = useState(0);
  const [interactionFeedback, setInteractionFeedback] = useState<InteractionFeedback | null>(null);
  const [companion, setCompanion] = useState<CompanionViewModel | null>(null);
  const [isCompanionChatOpen, setIsCompanionChatOpen] = useState(false);
  const [companionOpenGeneration, setCompanionOpenGeneration] = useState(0);
  const [preserveCompanionScreen, setPreserveCompanionScreen] = useState(false);
  const [openCreateRequest, setOpenCreateRequest] = useState(0);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [isRemoteRestoreInProgress, setIsRemoteRestoreInProgress] = useState(false);
  const selectedFragmentIdRef = useRef<string | null>(null);
  const isCompanionDialogOpenRef = useRef(false);
  const openingLockRef = useRef<string | null>(null);
  const openRequestGenerationRef = useRef(0);
  const reopenCompanionAfterDetailRef = useRef(false);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gardenModeButtonRef = useRef<HTMLButtonElement>(null);
  const cardModeButtonRef = useRef<HTMLButtonElement>(null);
  const backupButtonRef = useRef<HTMLButtonElement>(null);
  const remoteRestoreOperationRef = useRef<string | null>(null);
  const handleContentProcessingEvent = useCallback(
    (event: Readonly<{ type: "completed" | "failed"; message: string }>): void => {
      setInteractionFeedback({
        kind: event.type === "failed" ? "error" : "status",
        message: event.message,
      });
    },
    [],
  );
  const contentProcessing = useContentProcessingRuntime({ onEvent: handleContentProcessingEvent });
  // Historical Fragment-bound imports can still be pending after an upgrade.
  useExternalLinkImportRuntime(handleContentProcessingEvent);

  useEffect(() => {
    let restoredNoticeFrame: number | null = null;
    if (sessionStorage.getItem(RESTORE_COMPLETED_SESSION_KEY) === "true") {
      sessionStorage.removeItem(RESTORE_COMPLETED_SESSION_KEY);
      restoredNoticeFrame = window.requestAnimationFrame(() => {
        setInteractionFeedback({ kind: "status", message: "花园已经恢复完成。" });
      });
    }

    let recoveryTimer: number | null = null;
    const clearRecoveryTimer = (): void => {
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
    };
    const unsubscribe = subscribeToGardenRestoreEvents((event) => {
      if (event.type === "started") {
        remoteRestoreOperationRef.current = event.operationId;
        setIsRemoteRestoreInProgress(true);
        fragmentGardenDb.close();
        clearRecoveryTimer();
        recoveryTimer = window.setTimeout(() => window.location.reload(), 30_000);
        return;
      }
      if (remoteRestoreOperationRef.current !== event.operationId) return;
      clearRecoveryTimer();
      if (event.type === "completed") {
        sessionStorage.setItem(RESTORE_COMPLETED_SESSION_KEY, "true");
        window.location.reload();
        return;
      }
      remoteRestoreOperationRef.current = null;
      void fragmentGardenDb.open().finally(() => {
        setIsRemoteRestoreInProgress(false);
        setQueryAttempt((attempt) => attempt + 1);
      });
    });

    return () => {
      if (restoredNoticeFrame !== null) window.cancelAnimationFrame(restoredNoticeFrame);
      clearRecoveryTimer();
      unsubscribe();
    };
  }, []);
  const handleCompanionTypeChange = useCallback(
    (companionType: CompanionViewModel["type"] | null): void => {
      setCompanion((current) => {
        if (companionType === null) {
          return null;
        }

        return current?.type === companionType ? current : { type: companionType };
      });
    },
    [],
  );
  const handleCompanionChatOpenChange = useCallback(
    (shouldOpen: boolean, options?: { preserveScreen?: boolean }): void => {
      isCompanionDialogOpenRef.current = shouldOpen;
      if (shouldOpen) {
        setCancelInteractionRequest((request) => request + 1);
        setCompanionOpenGeneration((generation) => generation + 1);
        setPreserveCompanionScreen(options?.preserveScreen === true);
      } else {
        setPreserveCompanionScreen(false);
      }

      setIsCompanionChatOpen(shouldOpen);
    },
    [],
  );
  const handleCompanionCreateRequest = useCallback((): void => {
    isCompanionDialogOpenRef.current = false;
    setIsCompanionChatOpen(false);
    setMode("cards");
    setOpenCreateRequest((request) => request + 1);
  }, []);

  useDormancySync({ onFeedback: setInteractionFeedback });

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
  const gardenSummaryState: GardenSummaryState = useLiveQuery(
    async (): Promise<GardenSummaryState> => {
      try {
        return { status: "ready", summary: await queryGardenSummary() };
      } catch {
        return { status: "error" };
      }
    },
    [queryAttempt],
    LOADING_GARDEN_SUMMARY,
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
    {
      plantId,
      replaceSelected = false,
      reopenCompanionOnClose = false,
      successMessage,
      triggerElement,
      viewAlreadyRecorded = false,
    }: OpenFragmentOptions,
  ): Promise<boolean> {
    if (
      openingLockRef.current !== null ||
      (selectedFragmentIdRef.current !== null && !replaceSelected)
    ) {
      return false;
    }

    const requestGeneration = openRequestGenerationRef.current + 1;
    openRequestGenerationRef.current = requestGeneration;
    openingLockRef.current = fragmentId;
    if (!replaceSelected) {
      detailTriggerRef.current = triggerElement;
      reopenCompanionAfterDetailRef.current = reopenCompanionOnClose;
    }
    setOpeningFragmentId(fragmentId);
    setOpeningPlantId(plantId ?? null);
    setInteractionFeedback({
      kind: "status",
      message: "正在打开碎片详情…",
    });

    try {
      if (!viewAlreadyRecorded) {
        await recordFragmentViewed({ fragmentId });
      }

      if (openRequestGenerationRef.current !== requestGeneration) {
        return false;
      }

      selectedFragmentIdRef.current = fragmentId;
      setSelectedFragmentId(fragmentId);
      setInteractionFeedback(
        successMessage === undefined ? null : { kind: "status", message: successMessage },
      );
      return true;
    } catch {
      if (openRequestGenerationRef.current !== requestGeneration) {
        return false;
      }

      setInteractionFeedback({
        kind: "error",
        message: "详情打开失败，没有写入查看记录，也没有修改本地内容。请重试。",
      });
      reopenCompanionAfterDetailRef.current = false;
      return false;
    } finally {
      if (openRequestGenerationRef.current === requestGeneration) {
        openingLockRef.current = null;
        setOpeningFragmentId(null);
        setOpeningPlantId(null);
      }
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
    if (isCompanionDialogOpenRef.current) {
      return;
    }

    if (event.type === "COMPANION_CLICKED") {
      handleCompanionChatOpenChange(true);
      return;
    }

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
    setIsCompanionChatOpen(false);
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
    const shouldReopenCompanion = reopenCompanionAfterDetailRef.current;
    openRequestGenerationRef.current += 1;
    openingLockRef.current = null;
    reopenCompanionAfterDetailRef.current = false;
    setOpeningFragmentId(null);
    setOpeningPlantId(null);
    selectedFragmentIdRef.current = null;
    setSelectedFragmentId(null);
    if (shouldReopenCompanion) {
      handleCompanionChatOpenChange(true);
    } else {
      restoreDetailFocus();
    }
  }

  function handleDeleted(): void {
    openRequestGenerationRef.current += 1;
    openingLockRef.current = null;
    reopenCompanionAfterDetailRef.current = false;
    setOpeningFragmentId(null);
    setOpeningPlantId(null);
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
      <div className="mx-auto max-w-7xl" inert={isRemoteRestoreInProgress}>
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
          <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
            <GardenModeToggle
              cardButtonRef={cardModeButtonRef}
              gardenButtonRef={gardenModeButtonRef}
              mode={mode}
              onModeChange={handleModeChange}
            />
            <button
              className="rounded-md border border-garden-line bg-garden-paper px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
              onClick={() => setIsBackupOpen(true)}
              ref={backupButtonRef}
              type="button"
            >
              数据与备份
            </button>
          </div>
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

        <CompanionExperience
          companionOpenGeneration={companionOpenGeneration}
          gardenRevision={
            gardenState.status === "ready"
              ? gardenState.snapshot.plants
                  .map(
                    (plant) =>
                      `${plant.plantId}:${plant.vitality}:${plant.stage}:${plant.fragmentId}`,
                  )
                  .join("|")
              : gardenState.status
          }
          gardenSummary={
            gardenSummaryState.status === "ready"
              ? gardenSummaryState.summary
              : { activeCount: 0, dormantCount: 0, completedCount: 0, archivedCount: 0 }
          }
          gardenSummaryStatus={gardenSummaryState.status}
          preserveCompanionScreen={preserveCompanionScreen}
          isChatOpen={isCompanionChatOpen}
          onChatOpenChange={handleCompanionChatOpenChange}
          onCompanionTypeChange={handleCompanionTypeChange}
          onOpenFragment={(
            fragmentId,
            triggerElement,
            viewAlreadyRecorded = false,
            reopenCompanionOnClose = false,
          ) =>
            openFragment(fragmentId, {
              reopenCompanionOnClose,
              triggerElement,
              viewAlreadyRecorded,
            })
          }
          onRequestCreateFragment={handleCompanionCreateRequest}
        />

        <ContentProcessingIndicator
          buttonRef={contentProcessing.triggerRef}
          jobs={contentProcessing.jobs}
          onOpen={contentProcessing.openDialog}
        />

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
                  companion={companion}
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
              onExternalCreateCompleted={(notice) =>
                setInteractionFeedback({
                  kind: "status",
                  message:
                    notice.contentType === "link" || notice.contentType === "image"
                      ? "已经开始整理。完成后，它才会成为花园中的新笔记。"
                      : "已经种下了。以后再回来看看，它也许会慢慢长出新的方向。",
                })
              }
              openCreateRequest={openCreateRequest}
              onProcessingJobCreated={(jobId) => void contentProcessing.startJob(jobId)}
              openingFragmentId={openingFragmentId}
            />
          </section>
        </Activity>
      </div>

      <ContentProcessingDialog
        busyJobId={contentProcessing.busyJobId}
        errorMessage={contentProcessing.errorMessage}
        isOpen={contentProcessing.isDialogOpen && !isRemoteRestoreInProgress}
        jobs={contentProcessing.jobs}
        onCancel={contentProcessing.removeJob}
        onClose={() => contentProcessing.closeDialog()}
        onDelete={contentProcessing.removeJob}
        onOpenCompleted={(job, triggerElement) => {
          if (job.kind === "sprout" && job.status === "awaiting_confirmation") {
            if (job.sourceFragmentId === null) return;
            contentProcessing.closeDialog(false);
            void openFragment(job.sourceFragmentId, {
              successMessage: "新笔记预览已经准备好。打开发芽即可继续确认。",
              triggerElement,
            });
            return;
          }
          if (job.createdFragmentId === null) return;
          contentProcessing.closeDialog(false);
          void openFragment(job.createdFragmentId, {
            successMessage: "新笔记已经整理好了。",
            triggerElement,
          }).then(async (didOpen) => {
            if (!didOpen) return;
            try {
              await contentProcessing.dismissCompletedJob(job.id);
            } catch {
              // The formal note is already open. Keeping a stale lightweight
              // task entry is harmless and allows a later cleanup attempt.
            }
          });
        }}
        onRetry={contentProcessing.retryJob}
      />

      {!isRemoteRestoreInProgress && selectedFragmentId !== null ? (
        <FragmentDetailDialog
          fragmentId={selectedFragmentId}
          key={selectedFragmentId}
          onClose={closeDetailDialog}
          onDeleted={handleDeleted}
          onOpenRelatedFragment={(fragmentId) =>
            openFragment(fragmentId, {
              replaceSelected: true,
              triggerElement: null,
            })
          }
          onStartProcessingJob={(jobId) => void contentProcessing.startJob(jobId)}
        />
      ) : null}
      <DataBackupDialog
        isOpen={isBackupOpen && !isRemoteRestoreInProgress}
        onClose={() => setIsBackupOpen(false)}
        onRestoreCompleted={() => window.location.reload()}
      />
      {isRemoteRestoreInProgress ? (
        <div
          aria-live="assertive"
          className="fixed inset-0 z-50 grid place-items-center bg-garden-canvas/95 px-6 text-center"
          role="alert"
        >
          <div>
            <p className="font-display text-2xl font-semibold">另一页正在恢复花园</p>
            <p className="mt-2 text-sm text-garden-muted">完成后此页面会自动重新载入。</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
