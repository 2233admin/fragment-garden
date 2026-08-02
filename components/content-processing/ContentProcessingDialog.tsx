"use client";

import { useId, useState } from "react";

import type { ContentProcessingJob } from "@/domain";

import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog, type DialogAppearance } from "../shared/ModalDialog";
import {
  resolveProcessingStatusCopy,
  resolveProcessingStatusLabel,
  resolveProcessingTaskKind,
  resolveProcessingTaskName,
} from "./content-processing-presentation";
import { ContentProcessingTaskActions } from "./ContentProcessingTaskActions";
import { StarmapContentProcessingDialogBody } from "./StarmapContentProcessingDialogBody";

type ContentProcessingDialogProps = Readonly<{
  appearance?: DialogAppearance;
  busyJobId: string | null;
  errorMessage: string | null;
  isOpen: boolean;
  jobs: readonly ContentProcessingJob[];
  onCancel: (jobId: string) => Promise<void>;
  onClose: () => void;
  onDelete: (jobId: string) => Promise<void>;
  onOpenCompleted: (job: ContentProcessingJob, triggerElement: HTMLButtonElement) => void;
  onRetry: (jobId: string) => Promise<void>;
}>;

type PendingConfirmation = Readonly<{
  action: "cancel" | "delete";
  jobId: string;
}>;

export function ContentProcessingDialog({
  appearance = "default",
  busyJobId,
  errorMessage,
  isOpen,
  jobs,
  onCancel,
  onClose,
  onDelete,
  onOpenCompleted,
  onRetry,
}: ContentProcessingDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const isPending = busyJobId !== null;
  const confirmedJob = jobs.find((job) => job.id === confirmation?.jobId);
  const isDeletingImage = confirmedJob?.kind === "image";
  const isCancellingSprout = confirmedJob?.kind === "sprout";

  function confirmRemoval(): void {
    if (confirmation === null) return;
    const operation =
      confirmation.action === "cancel"
        ? onCancel(confirmation.jobId)
        : onDelete(confirmation.jobId);
    void operation.finally(() => setConfirmation(null));
  }

  return (
    <>
      <ModalDialog
        appearance={appearance}
        className={
          appearance === "starmap"
            ? "memory-processing-dialog m-auto max-h-[min(86dvh,44rem)] w-[min(92vw,36rem)] overflow-hidden rounded-lg p-0"
            : "m-auto max-h-[90vh] w-[min(92vw,42rem)] overflow-y-auto rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
        }
        describedBy={descriptionId}
        isOpen={isOpen}
        isPending={isPending}
        labelledBy={titleId}
        onRequestClose={onClose}
      >
        {appearance === "starmap" ? (
          <StarmapContentProcessingDialogBody
            busyJobId={busyJobId}
            descriptionId={descriptionId}
            errorMessage={errorMessage}
            jobs={jobs}
            onClose={onClose}
            onOpenCompleted={onOpenCompleted}
            onRequestCancel={(jobId) => setConfirmation({ action: "cancel", jobId })}
            onRequestDelete={(jobId) => setConfirmation({ action: "delete", jobId })}
            onRetry={onRetry}
            titleId={titleId}
          />
        ) : (
          <>
            <header className="memory-dialog__header border-b border-garden-line px-6 py-5 sm:px-8">
              <p className="memory-dialog__eyebrow text-xs font-semibold text-garden-accent">
                内容整理
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
                正在整理的内容
              </h2>
              <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
                链接和图片整理成功后才会成为正式笔记和记忆星。离开这里不会中断可以继续的任务。
              </p>
            </header>

            <div aria-live="polite" className="px-6 py-5 sm:px-8">
              {errorMessage !== null ? (
                <p
                  className="mb-4 rounded-md bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}

              {jobs.length === 0 ? (
                <p className="py-10 text-center text-sm text-garden-muted">
                  现在没有需要查看的整理任务。
                </p>
              ) : (
                <ul className="divide-y divide-garden-line">
                  {jobs.map((job) => (
                    <li className="py-5 first:pt-1 last:pb-1" key={job.id}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-garden-accent">
                              {resolveProcessingTaskKind(job)}
                            </span>
                            <span className="text-xs text-garden-muted">
                              {resolveProcessingStatusLabel(job)}
                            </span>
                          </div>
                          <h3 className="mt-1 truncate text-base font-semibold text-garden-ink">
                            {resolveProcessingTaskName(job)}
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-garden-muted">
                            {resolveProcessingStatusCopy(job)}
                          </p>
                        </div>

                        <ContentProcessingTaskActions
                          appearance="default"
                          busyJobId={busyJobId}
                          job={job}
                          onOpenCompleted={onOpenCompleted}
                          onRequestCancel={(jobId) => setConfirmation({ action: "cancel", jobId })}
                          onRequestDelete={(jobId) => setConfirmation({ action: "delete", jobId })}
                          onRetry={onRetry}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="memory-dialog__footer flex justify-end border-t border-garden-line px-6 py-4 sm:px-8">
              <button
                className="rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                disabled={isPending}
                onClick={onClose}
                type="button"
              >
                关闭
              </button>
            </footer>
          </>
        )}
      </ModalDialog>

      <ConfirmDialog
        appearance={appearance}
        confirmLabel={confirmation?.action === "cancel" ? "取消任务" : "删除任务"}
        description={
          isDeletingImage
            ? "确认后，这张图片的临时整理任务和本地原图会被删除，不会创建正式笔记。"
            : isCancellingSprout
              ? "确认后，这次发芽任务会结束，不会创建新笔记，也不会修改原笔记。"
              : "确认后，这条链接整理任务会被移除，不会创建正式笔记。"
        }
        errorMessage={errorMessage}
        isOpen={confirmation !== null}
        isPending={confirmation !== null && busyJobId === confirmation.jobId}
        onCancel={() => {
          if (!isPending) setConfirmation(null);
        }}
        onConfirm={confirmRemoval}
        pendingLabel="正在处理…"
        title={confirmation?.action === "cancel" ? "取消这条整理任务？" : "删除这条整理任务？"}
      />
    </>
  );
}
