"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { ContentProcessingJobRepository } from "@/data/repositories/content-processing-job-repository";
import type { ContentProcessingJobKind } from "@/domain";
import {
  cleanupSettledContentProcessingJobs,
  dismissCompletedContentProcessingJob,
} from "@/services/content-processing-job-lifecycle";
import { localPersistenceErrorMessage } from "@/services/local-persistence-error";
import {
  cancelImageProcessingJob,
  markStaleImageProcessingJobs,
  processImageProcessingJob,
  retryImageProcessingJob,
} from "@/services/image-processing-jobs";
import {
  LinkProcessingJobManager,
  type LinkProcessingJobManagerEvent,
} from "@/services/link-processing-job-manager";
import {
  cancelSproutGenerationJob,
  markStaleSproutGenerationJobs,
  processSproutGenerationJob,
} from "@/services/sprout-generation-jobs";

const VISIBLE_JOB_STATUSES = [
  "pending",
  "processing",
  "awaiting_confirmation",
  "failed",
  "completed",
] as const;
const MAX_IMAGE_CONCURRENCY = 2;

type ImageQueueItem = Readonly<{
  jobId: string;
  mode: "start" | "retry";
}>;

export type ContentProcessingRuntimeEvent = Readonly<{
  type: "completed" | "failed";
  jobId: string;
  fragmentId: string | null;
  message: string;
}>;

type UseContentProcessingRuntimeOptions = Readonly<{
  kinds?: readonly ContentProcessingJobKind[];
  onEvent: (event: ContentProcessingRuntimeEvent) => void;
}>;

type StartContentProcessingJobOptions = Readonly<{
  shouldOpenDialog?: boolean;
}>;

const ALL_PROCESSING_JOB_KINDS: readonly ContentProcessingJobKind[] = ["link", "image", "sprout"];

export function useContentProcessingRuntime({
  kinds,
  onEvent,
}: UseContentProcessingRuntimeOptions) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busyJobIdRef = useRef<string | null>(null);
  const onEventRef = useRef(onEvent);
  const linkManagerRef = useRef<LinkProcessingJobManager | null>(null);
  const imageQueueRef = useRef<ImageQueueItem[]>([]);
  const queuedImageJobIdsRef = useRef(new Set<string>());
  const activeImageJobIdsRef = useRef(new Set<string>());
  const imageAbortControllersRef = useRef(new Map<string, AbortController>());
  const activeSproutJobIdsRef = useRef(new Set<string>());
  const isDisposedRef = useRef(false);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const visibleKinds = kinds ?? ALL_PROCESSING_JOB_KINDS;
  const visibleKindsKey = visibleKinds.join(":");
  const includesImageJobs = visibleKinds.includes("image");
  const includesLinkJobs = visibleKinds.includes("link");
  const includesSproutJobs = visibleKinds.includes("sprout");
  const jobs =
    useLiveQuery(
      () =>
        new ContentProcessingJobRepository().listByKindsAndStatuses(
          visibleKinds,
          VISIBLE_JOB_STATUSES,
        ),
      [visibleKindsKey],
      [],
    ) ?? [];

  const reportEvent = useCallback((event: ContentProcessingRuntimeEvent): void => {
    onEventRef.current(event);
  }, []);

  const runSproutJob = useCallback(
    async (jobId: string): Promise<void> => {
      if (isDisposedRef.current || activeSproutJobIdsRef.current.has(jobId)) return;
      activeSproutJobIdsRef.current.add(jobId);
      try {
        const result = await processSproutGenerationJob(jobId);
        if (isDisposedRef.current || result === null) return;
        reportEvent({
          type: result.status === "awaiting_confirmation" ? "completed" : "failed",
          jobId,
          fragmentId: null,
          message:
            result.status === "awaiting_confirmation"
              ? "一条新笔记预览已经发芽完成，确认后才会种下。"
              : (result.errorMessage ?? "这次发芽没有完成，没有创建新笔记。"),
        });
      } catch {
        if (!isDisposedRef.current) {
          reportEvent({
            type: "failed",
            jobId,
            fragmentId: null,
            message: "这次发芽没有完成，没有创建新笔记，可以稍后重试。",
          });
        }
      } finally {
        activeSproutJobIdsRef.current.delete(jobId);
      }
    },
    [reportEvent],
  );

  const runImageWorker = useCallback(async (): Promise<void> => {
    while (!isDisposedRef.current) {
      if (activeImageJobIdsRef.current.size >= MAX_IMAGE_CONCURRENCY) return;
      const item = imageQueueRef.current.shift();
      if (item === undefined) break;
      queuedImageJobIdsRef.current.delete(item.jobId);
      if (activeImageJobIdsRef.current.has(item.jobId)) continue;

      activeImageJobIdsRef.current.add(item.jobId);
      const controller = new AbortController();
      imageAbortControllersRef.current.set(item.jobId, controller);
      const operation =
        item.mode === "retry"
          ? retryImageProcessingJob(item.jobId, { signal: controller.signal })
          : processImageProcessingJob(item.jobId, { signal: controller.signal });

      try {
        const result = await operation;
        if (!isDisposedRef.current && !controller.signal.aborted && result !== null) {
          reportEvent({
            type: "completed",
            jobId: item.jobId,
            fragmentId: result.fragment.id,
            message: "新笔记已经整理好了。",
          });
        }
      } catch (error) {
        if (!isDisposedRef.current && !controller.signal.aborted) {
          reportEvent({
            type: "failed",
            jobId: item.jobId,
            fragmentId: null,
            message: localPersistenceErrorMessage(
              error,
              "图片暂时没能整理完成，原图仍保存在任务中，可以手动重试。",
            ),
          });
        }
      } finally {
        activeImageJobIdsRef.current.delete(item.jobId);
        imageAbortControllersRef.current.delete(item.jobId);
      }
    }
  }, [reportEvent]);

  const drainImageQueue = useCallback((): void => {
    while (
      !isDisposedRef.current &&
      activeImageJobIdsRef.current.size < MAX_IMAGE_CONCURRENCY &&
      imageQueueRef.current.length > 0
    ) {
      void runImageWorker();
    }
  }, [runImageWorker]);

  const enqueueImageJob = useCallback(
    (jobId: string, mode: ImageQueueItem["mode"]): void => {
      if (
        isDisposedRef.current ||
        queuedImageJobIdsRef.current.has(jobId) ||
        activeImageJobIdsRef.current.has(jobId)
      ) {
        return;
      }

      queuedImageJobIdsRef.current.add(jobId);
      imageQueueRef.current.push({ jobId, mode });
      drainImageQueue();
    },
    [drainImageQueue],
  );

  useEffect(() => {
    isDisposedRef.current = false;
    const activeImageJobIds = activeImageJobIdsRef.current;
    const imageAbortControllers = imageAbortControllersRef.current;
    const queuedImageJobIds = queuedImageJobIdsRef.current;
    const handleLinkEvent = (event: LinkProcessingJobManagerEvent): void => reportEvent(event);
    const manager = new LinkProcessingJobManager({ onEvent: handleLinkEvent });
    linkManagerRef.current = manager;

    void cleanupSettledContentProcessingJobs().catch(() => undefined);
    if (includesImageJobs)
      void markStaleImageProcessingJobs(new Date()).catch(() => {
        reportEvent({
          type: "failed",
          jobId: "image-recovery",
          fragmentId: null,
          message: "暂时没能恢复图片整理状态，原始任务仍保存在当前浏览器中。",
        });
      });
    if (includesSproutJobs)
      void markStaleSproutGenerationJobs(new Date(Date.now() - 15 * 60 * 1000)).catch(() => {
        reportEvent({
          type: "failed",
          jobId: "sprout-recovery",
          fragmentId: null,
          message: "暂时没能恢复发芽任务状态，原笔记没有被修改。",
        });
      });
    if (includesSproutJobs) {
      void new ContentProcessingJobRepository()
        .listByKindAndStatuses("sprout", ["pending"])
        .then((pendingJobs) => pendingJobs.forEach((job) => void runSproutJob(job.id)))
        .catch(() => undefined);
    }
    if (includesLinkJobs) void manager.resumePendingJobs();

    const resumeLinks = (): void => {
      if (!includesLinkJobs) return;
      void manager.resumePendingJobs();
    };
    window.addEventListener("online", resumeLinks);

    return () => {
      isDisposedRef.current = true;
      window.removeEventListener("online", resumeLinks);
      manager.dispose();
      linkManagerRef.current = null;
      imageQueueRef.current = [];
      queuedImageJobIds.clear();
      for (const controller of imageAbortControllers.values()) {
        controller.abort();
      }
      imageAbortControllers.clear();
      activeImageJobIds.clear();
    };
  }, [includesImageJobs, includesLinkJobs, includesSproutJobs, reportEvent, runSproutJob]);

  const openDialog = useCallback((): void => {
    setErrorMessage(null);
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback((shouldRestoreFocus = true): void => {
    setErrorMessage(null);
    setIsDialogOpen(false);
    if (shouldRestoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const startJob = useCallback(
    async (
      jobId: string,
      { shouldOpenDialog = true }: StartContentProcessingJobOptions = {},
    ): Promise<void> => {
      setErrorMessage(null);

      const reportStartFailure = (message: string): void => {
        if (shouldOpenDialog) {
          setIsDialogOpen(true);
          setErrorMessage(message);
        }
        reportEvent({
          type: "failed",
          jobId,
          fragmentId: null,
          message,
        });
      };

      try {
        const job = await new ContentProcessingJobRepository().getById(jobId);
        if (job === undefined) {
          reportStartFailure("暂时没能找到这条整理任务。没有创建任何卡片。");
          return;
        }

        // Sprout generation already owns an editable preview dialog. Opening
        // the global task dialog here would cover that preview in the native
        // dialog top layer and make its confirmation controls unreachable.
        if (shouldOpenDialog && job.kind !== "sprout") {
          setIsDialogOpen(true);
        }
        if (job.kind === "link") {
          const manager = linkManagerRef.current;
          if (manager === null) {
            reportStartFailure("整理任务已经保存在本地，但暂时没能开始。请打开任务列表后重试。");
            return;
          }
          manager.start(jobId);
          return;
        }
        if (job.kind === "image") {
          enqueueImageJob(jobId, "start");
          return;
        }
        if (job.kind === "sprout") {
          void runSproutJob(jobId);
          return;
        }

        reportStartFailure("整理任务已经保存在本地，但暂时没能开始。请打开任务列表后重试。");
      } catch (error) {
        reportStartFailure(
          localPersistenceErrorMessage(
            error,
            "整理任务已经保存在本地，但暂时没能开始。请打开任务列表后重试。",
          ),
        );
      }
    },
    [enqueueImageJob, reportEvent, runSproutJob],
  );

  const retryJob = useCallback(
    async (jobId: string): Promise<void> => {
      if (busyJobIdRef.current !== null) return;
      busyJobIdRef.current = jobId;
      setBusyJobId(jobId);
      setErrorMessage(null);
      try {
        const job = await new ContentProcessingJobRepository().getById(jobId);
        if (job?.kind === "link" && linkManagerRef.current !== null) {
          await linkManagerRef.current.retry(jobId);
        } else if (job?.kind === "image" && job.status === "pending") {
          enqueueImageJob(jobId, "start");
        } else if (job?.kind === "image" && job.status === "failed") {
          enqueueImageJob(jobId, "retry");
        } else if (
          job?.kind === "sprout" &&
          (job.status === "pending" || job.status === "failed")
        ) {
          await runSproutJob(jobId);
        } else {
          throw new Error("Processing job was not found");
        }
      } catch (error) {
        setErrorMessage(
          localPersistenceErrorMessage(
            error,
            "这次重试没有开始，任务和原始内容仍然保留。请稍后再试。",
          ),
        );
      } finally {
        busyJobIdRef.current = null;
        setBusyJobId(null);
      }
    },
    [enqueueImageJob, runSproutJob],
  );

  const removeJob = useCallback(async (jobId: string): Promise<void> => {
    if (busyJobIdRef.current !== null) return;
    busyJobIdRef.current = jobId;
    setBusyJobId(jobId);
    setErrorMessage(null);
    try {
      const job = await new ContentProcessingJobRepository().getById(jobId);
      if (job?.kind === "image") {
        imageAbortControllersRef.current.get(jobId)?.abort();
        imageQueueRef.current = imageQueueRef.current.filter((item) => item.jobId !== jobId);
        queuedImageJobIdsRef.current.delete(jobId);
        await cancelImageProcessingJob(jobId);
      } else if (job?.kind === "link") {
        await linkManagerRef.current?.delete(jobId);
      } else if (job?.kind === "sprout") {
        await cancelSproutGenerationJob(jobId);
      }
    } catch {
      setErrorMessage("这条任务暂时没能删除，原始内容仍然保留。请稍后再试。");
    } finally {
      busyJobIdRef.current = null;
      setBusyJobId(null);
    }
  }, []);

  const dismissCompletedJob = useCallback(async (jobId: string): Promise<void> => {
    await dismissCompletedContentProcessingJob(jobId);
  }, []);

  const orderedJobs = [...jobs].sort((left, right) => {
    const updatedAtComparison = right.updatedAt.localeCompare(left.updatedAt);
    return updatedAtComparison === 0 ? right.id.localeCompare(left.id) : updatedAtComparison;
  });

  return {
    busyJobId,
    closeDialog,
    dismissCompletedJob,
    errorMessage,
    isDialogOpen,
    jobs: orderedJobs,
    openDialog,
    removeJob,
    retryJob,
    startJob,
    triggerRef,
  };
}
