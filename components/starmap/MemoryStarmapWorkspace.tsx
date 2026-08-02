"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { DataBackupDialog } from "@/components/backup/DataBackupDialog";
import { ContentProcessingDialog } from "@/components/content-processing/ContentProcessingDialog";
import {
  useContentProcessingRuntime,
  type ContentProcessingRuntimeEvent,
} from "@/components/content-processing/useContentProcessingRuntime";
import {
  CreateFragmentDialog,
  type CreatedFragmentNotice,
  type ForegroundProcessingTransitionUpdate,
} from "@/components/fragments/CreateFragmentDialog";
import { useExternalLinkImportRuntime } from "@/components/link-imports/useExternalLinkImportRuntime";
import { StarmapSettingsDialog } from "@/components/settings/StarmapSettingsDialog";
import { queryStarMapSnapshot } from "@/data/queries/star-map-query";
import {
  deriveStarfieldRotationSpeed,
  type ContentProcessingJob,
  type StarMapSnapshot,
} from "@/domain";

import { MemoryStarDetailPanel, type MemoryStarDetailAnchor } from "./MemoryStarDetailPanel";
import { MemoryStarmapDock } from "./MemoryStarmapDock";
import { MemoryStarmapCanvas, type MemoryStarmapCanvasHandle } from "./MemoryStarmapCanvas";
import { StarArchivePlaceholderDialog } from "./StarArchivePlaceholderDialog";

const MEMORY_STARMAP_JOB_KINDS = ["link", "image"] as const;
const EMPTY_SNAPSHOT: StarMapSnapshot = {
  stars: [],
  contentStarCount: 0,
  rotationSpeedRadiansPerSecond: deriveStarfieldRotationSpeed(0),
};

type StarMapQueryState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "ready"; snapshot: StarMapSnapshot }>;

type WorkspaceFeedback = Readonly<{
  kind: "status" | "error";
  message: string;
}>;

const LOADING_QUERY_STATE: StarMapQueryState = { status: "loading" };

function resolveProcessingSummary(jobs: readonly ContentProcessingJob[]): string {
  const activeCount = jobs.filter(
    (job) => job.status === "pending" || job.status === "processing",
  ).length;
  if (activeCount > 0) return `正在整理 ${activeCount}`;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  if (failedCount > 0) return `${failedCount} 条需要处理`;
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  if (completedCount > 0) return `${completedCount} 条已整理`;
  return "内容任务";
}

function canRestoreStarDetailFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[inert]") !== null) return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  const ownerDialog = element.closest("dialog");
  return ownerDialog === null || ownerDialog.open;
}

function creationFeedback(notice: CreatedFragmentNotice): WorkspaceFeedback {
  if (notice.contentType === "text") {
    return { kind: "status", message: "记录已经保存，一颗新的记忆星正在亮起。" };
  }
  if (notice.contentType === "link") {
    return {
      kind: "status",
      message: "链接已经进入整理任务。读取成功后，它才会成为一颗记忆星。",
    };
  }
  if (notice.contentType === "image") {
    return {
      kind: "status",
      message: "图片已经安全保存在整理任务中。分析成功后，它才会成为一颗记忆星。",
    };
  }
  return { kind: "status", message: "记录已经保存在当前浏览器中。" };
}

export function MemoryStarmapWorkspace() {
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);
  const [selectedStarAnchor, setSelectedStarAnchor] = useState<MemoryStarDetailAnchor | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [feedback, setFeedback] = useState<WorkspaceFeedback | null>(null);
  const [foregroundProcessingUpdate, setForegroundProcessingUpdate] =
    useState<ForegroundProcessingTransitionUpdate | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const recordActionRef = useRef<HTMLButtonElement>(null);
  const starmapCanvasRef = useRef<MemoryStarmapCanvasHandle>(null);
  const foregroundProcessingJobIdRef = useRef<string | null>(null);

  const handleProcessingEvent = useCallback((event: ContentProcessingRuntimeEvent): void => {
    if (foregroundProcessingJobIdRef.current === event.jobId) {
      if (event.type === "completed" && event.fragmentId !== null) {
        const canvas = starmapCanvasRef.current;
        canvas?.setStarLaunchActive(event.fragmentId);
        const target = canvas?.getStarScreenPosition(event.fragmentId) ?? null;
        if (target === null) {
          canvas?.setStarLaunchActive(null);
          setForegroundProcessingUpdate({
            jobId: event.jobId,
            outcome: {
              message:
                "内容已经整理完成，但星空暂时无法显示它的位置。可以在任务列表中打开这条记录。",
              status: "failed",
            },
            target: null,
          });
          return;
        }
        setForegroundProcessingUpdate({
          jobId: event.jobId,
          outcome: { fragmentId: event.fragmentId, status: "completed" },
          target,
        });
        return;
      }

      starmapCanvasRef.current?.setStarLaunchActive(null);
      setForegroundProcessingUpdate({
        jobId: event.jobId,
        outcome: {
          message:
            event.type === "failed"
              ? event.message
              : "内容已经整理完成，但暂时无法定位对应的记忆星。可以在任务列表中打开它。",
          status: "failed",
        },
        target: null,
      });
      return;
    }

    setFeedback({
      kind: event.type === "failed" ? "error" : "status",
      message: event.message,
    });
  }, []);
  const {
    busyJobId: processingBusyJobId,
    closeDialog: closeProcessingDialog,
    dismissCompletedJob,
    errorMessage: processingErrorMessage,
    isDialogOpen: isProcessingDialogOpen,
    jobs: processingJobs,
    openDialog: openProcessingDialog,
    removeJob: removeProcessingJob,
    retryJob: retryProcessingJob,
    startJob: startProcessingJob,
    triggerRef: processingTriggerRef,
  } = useContentProcessingRuntime({
    kinds: MEMORY_STARMAP_JOB_KINDS,
    onEvent: handleProcessingEvent,
  });
  const handleLegacyLinkEvent = useCallback(
    (event: Readonly<{ type: "completed" | "failed"; message: string }>): void => {
      setFeedback({
        kind: event.type === "failed" ? "error" : "status",
        message: event.message,
      });
    },
    [],
  );
  useExternalLinkImportRuntime(handleLegacyLinkEvent);

  const queryState: StarMapQueryState = useLiveQuery(
    async (): Promise<StarMapQueryState> => {
      try {
        return { status: "ready", snapshot: await queryStarMapSnapshot() };
      } catch {
        return { status: "error" };
      }
    },
    [queryAttempt],
    LOADING_QUERY_STATE,
  );
  const snapshot = queryState.status === "ready" ? queryState.snapshot : EMPTY_SNAPSHOT;
  const totalNoteCount = useMemo(
    () => snapshot.stars.reduce((count, star) => count + star.userNoteCount, 0),
    [snapshot.stars],
  );
  const visibleSelectedFragmentId =
    selectedFragmentId !== null &&
    (queryState.status !== "ready" ||
      snapshot.stars.some((star) => star.fragmentId === selectedFragmentId))
      ? selectedFragmentId
      : null;

  const resolveStarAnchor = useCallback(
    (fragmentId: string): MemoryStarDetailAnchor | null =>
      starmapCanvasRef.current?.getStarScreenPosition(fragmentId) ?? null,
    [],
  );

  function openStar(fragmentId: string, triggerElement: HTMLButtonElement | null): void {
    detailTriggerRef.current = triggerElement;
    setSelectedStarAnchor(resolveStarAnchor(fragmentId));
    setSelectedFragmentId(fragmentId);
  }

  function closeStar(shouldRestoreFocus = true): void {
    setSelectedFragmentId(null);
    setSelectedStarAnchor(null);
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    if (shouldRestoreFocus && trigger !== null) {
      requestAnimationFrame(() => {
        if (canRestoreStarDetailFocus(trigger)) {
          trigger.focus();
          return;
        }
        const fallback = recordActionRef.current;
        if (fallback !== null && canRestoreStarDetailFocus(fallback)) fallback.focus();
      });
    }
  }

  function openCreateDialog(): void {
    closeStar(false);
    setIsCreateOpen(true);
  }

  function openArchiveDialog(): void {
    closeStar(false);
    setIsArchiveOpen(true);
  }

  function openSettingsDialog(): void {
    closeStar(false);
    setIsSettingsOpen(true);
  }

  function openProcessingOverlay(): void {
    closeStar(false);
    openProcessingDialog();
  }

  function handleCreated(notice: CreatedFragmentNotice): void {
    if (notice.contentType === "link" || notice.contentType === "image") {
      foregroundProcessingJobIdRef.current = notice.processingJobId;
      setForegroundProcessingUpdate({
        jobId: notice.processingJobId,
        outcome: { status: "pending" },
        target: null,
      });
      setFeedback(null);
      void startProcessingJob(notice.processingJobId, { shouldOpenDialog: false });
      return;
    }

    setFeedback(creationFeedback(notice));
  }

  const resolveTextStarTarget = useCallback(async (fragmentId: string) => {
    const canvas = starmapCanvasRef.current;
    if (canvas === null) return null;
    canvas.setStarLaunchActive(fragmentId);
    return canvas.getStarScreenPosition(fragmentId);
  }, []);

  const finishTextStarTransition = useCallback((): void => {
    starmapCanvasRef.current?.setStarLaunchActive(null);
  }, []);

  function clearForegroundProcessing(jobId: string): void {
    if (foregroundProcessingJobIdRef.current !== jobId) return;
    foregroundProcessingJobIdRef.current = null;
    setForegroundProcessingUpdate(null);
    starmapCanvasRef.current?.setStarLaunchActive(null);
  }

  function finishProcessingStarTransition(jobId: string): void {
    clearForegroundProcessing(jobId);
    void dismissCompletedJob(jobId).catch(() => undefined);
  }

  function continueProcessingInBackground(jobId: string): void {
    clearForegroundProcessing(jobId);
    setFeedback({
      kind: "status",
      message: "任务仍保存在本地。进行中的整理会继续，失败任务可以稍后重试。",
    });
  }

  function openForegroundProcessingTasks(jobId: string): void {
    clearForegroundProcessing(jobId);
    openProcessingDialog();
  }

  function openCompletedJob(job: ContentProcessingJob, triggerElement: HTMLButtonElement): void {
    if (job.createdFragmentId === null) return;
    closeProcessingDialog(false);
    openStar(job.createdFragmentId, triggerElement);
    void dismissCompletedJob(job.id).catch(() => undefined);
  }

  return (
    <main className="memory-starmap-shell">
      <div className="memory-starmap-scene" aria-label="碎片宇宙">
        {queryState.status === "error" ? (
          <section className="memory-starmap-query-error" role="alert">
            <h1>无法读取本地记录</h1>
            <p>没有内容被修改。可以重新读取，备份功能仍然可用。</p>
            <button onClick={() => setQueryAttempt((attempt) => attempt + 1)} type="button">
              重新读取
            </button>
          </section>
        ) : (
          <MemoryStarmapCanvas
            onClearSelection={closeStar}
            onSelectStar={openStar}
            ref={starmapCanvasRef}
            selectedFragmentId={visibleSelectedFragmentId}
            snapshot={snapshot}
          />
        )}

        <header className="memory-starmap-header">
          <div className="memory-starmap-brand">
            <p>LOCAL MEMORY ARCHIVE</p>
            <h1>碎片宇宙</h1>
          </div>
          {processingJobs.length > 0 ? (
            <nav aria-label="内容处理状态" className="memory-starmap-actions">
              <button
                className="memory-starmap-action memory-starmap-action--quiet"
                data-starmap-overlay-trigger="true"
                onClick={openProcessingOverlay}
                ref={processingTriggerRef}
                type="button"
              >
                <span aria-hidden="true" className="memory-starmap-status-dot" />
                {resolveProcessingSummary(processingJobs)}
              </button>
            </nav>
          ) : null}
        </header>

        {snapshot.contentStarCount === 0 && queryState.status === "ready" ? (
          <section className="memory-starmap-empty" aria-labelledby="empty-starmap-title">
            <p className="memory-starmap-empty-mark" aria-hidden="true">
              ✦
            </p>
            <h2 id="empty-starmap-title">星空正在等待第一条记录</h2>
            <p>写下一段文字，或保存一条链接、一张图片。</p>
            <button onClick={openCreateDialog} type="button">
              点亮第一颗星
            </button>
          </section>
        ) : null}

        <div className="memory-starmap-hud" aria-live="polite">
          <span>
            <b>{snapshot.contentStarCount}</b> 颗记忆星
          </span>
          <span>
            <b>{totalNoteCount}</b> 条后续补充
          </span>
          <span className="memory-starmap-hud-hint">选择一颗亮星，重新打开那段记忆</span>
        </div>

        <MemoryStarmapDock
          onOpenArchive={openArchiveDialog}
          onOpenRecord={openCreateDialog}
          onOpenSettings={openSettingsDialog}
          recordButtonRef={recordActionRef}
        />

        {feedback !== null ? (
          <div
            aria-live={feedback.kind === "error" ? "assertive" : "polite"}
            className={`memory-starmap-toast memory-starmap-toast--${feedback.kind}`}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
            <button aria-label="关闭提示" onClick={() => setFeedback(null)} type="button">
              ×
            </button>
          </div>
        ) : null}
      </div>

      <CreateFragmentDialog
        appearance="starmap"
        foregroundProcessingUpdate={foregroundProcessingUpdate}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCreated}
        onOpenExistingFragment={(fragmentId, triggerElement) =>
          openStar(fragmentId, triggerElement)
        }
        onResolveTextStarTarget={resolveTextStarTarget}
        onTextStarTransitionComplete={finishTextStarTransition}
        onContinueProcessingInBackground={continueProcessingInBackground}
        onOpenProcessingTasks={openForegroundProcessingTasks}
        onProcessingStarTransitionComplete={finishProcessingStarTransition}
      />

      <ContentProcessingDialog
        appearance="starmap"
        busyJobId={processingBusyJobId}
        errorMessage={processingErrorMessage}
        isOpen={isProcessingDialogOpen}
        jobs={processingJobs}
        onCancel={removeProcessingJob}
        onClose={() => closeProcessingDialog()}
        onDelete={removeProcessingJob}
        onOpenCompleted={openCompletedJob}
        onRetry={retryProcessingJob}
      />

      <StarArchivePlaceholderDialog
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
      />

      <StarmapSettingsDialog
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenBackup={() => setIsBackupOpen(true)}
      />

      <DataBackupDialog
        appearance="starmap"
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestoreCompleted={() => window.location.reload()}
      />

      {visibleSelectedFragmentId !== null ? (
        <MemoryStarDetailPanel
          anchor={selectedStarAnchor}
          fragmentId={visibleSelectedFragmentId}
          onClose={closeStar}
          resolveAnchor={resolveStarAnchor}
        />
      ) : null}
    </main>
  );
}
