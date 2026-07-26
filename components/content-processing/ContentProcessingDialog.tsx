"use client";

import { useId, useState } from "react";

import type { ContentProcessingJob } from "@/domain";
import { LOCAL_STORAGE_FULL_MESSAGE } from "../../services/local-persistence-error";

import { AsyncButton } from "../shared/AsyncButton";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog } from "../shared/ModalDialog";

type ContentProcessingDialogProps = Readonly<{
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

function resolveTaskName(job: ContentProcessingJob): string {
  if (job.resultTitle?.trim()) {
    return job.resultTitle.trim();
  }
  if (job.kind === "image") {
    return job.sourceFileName?.trim() || "图片内容";
  }
  if (job.kind === "link" && job.sourceUrl !== null) {
    try {
      return new URL(job.sourceUrl).hostname.replace(/^www\./u, "");
    } catch {
      return "链接内容";
    }
  }
  if (job.kind === "sprout") {
    return job.resultTitle?.trim() || "正在发芽的新笔记";
  }
  return "待整理内容";
}

function resolveStatusCopy(job: ContentProcessingJob): string {
  if (job.status === "pending") {
    if (job.kind === "image") {
      return "原图已经保存在本地。继续整理后才会发送当前图片并创建正式笔记。";
    }
    return job.kind === "sprout"
      ? "正在准备从原笔记生成一条新笔记。完成后仍需你预览确认。"
      : "正在准备整理。你可以离开这里，稍后再回来查看。";
  }
  if (job.status === "processing") {
    return job.kind === "sprout"
      ? "正在发芽。生成和预览期间都不会创建卡片或植物。"
      : "正在整理这条内容。完成前不会创建卡片或植物。";
  }
  if (job.status === "failed") {
    if (job.errorCode === "local_storage_full") {
      return LOCAL_STORAGE_FULL_MESSAGE;
    }
    if (job.kind === "image") {
      return "这张图片暂时没能整理完成，原图仍保存在本地任务中。";
    }
    return job.kind === "sprout"
      ? "这次发芽没有完成，原笔记没有被修改，也没有创建新卡片。"
      : "这个链接暂时没能整理完成，没有留下空卡片。";
  }
  if (job.status === "completed") {
    return "新笔记已经整理好了。";
  }
  if (job.status === "awaiting_confirmation") {
    return job.kind === "sprout"
      ? "新笔记预览已经准备好，确认种下前仍不是正式卡片。"
      : "内容已经准备好，等待确认。";
  }
  return "这条任务已经取消。";
}

function taskStatusLabel(job: ContentProcessingJob): string {
  if (job.status === "pending") return "等待整理";
  if (job.status === "processing") return "正在整理";
  if (job.status === "failed") return "需要处理";
  if (job.status === "completed") return "整理完成";
  if (job.status === "awaiting_confirmation") return "等待确认";
  return "已取消";
}

export function ContentProcessingDialog({
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
        className="m-auto max-h-[90vh] w-[min(92vw,42rem)] overflow-y-auto rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
        describedBy={descriptionId}
        isOpen={isOpen}
        isPending={isPending}
        labelledBy={titleId}
        onRequestClose={onClose}
      >
        <header className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold text-garden-accent">内容整理</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
            正在整理的内容
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
            链接和图片整理成功后才会成为正式笔记；发芽还需要预览确认。离开这里不会中断可以继续的任务。
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
              {jobs.map((job) => {
                const isJobPending = busyJobId === job.id;

                return (
                  <li className="py-5 first:pt-1 last:pb-1" key={job.id}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-garden-accent">
                            {job.kind === "image" ? "图片" : job.kind === "link" ? "链接" : "发芽"}
                          </span>
                          <span className="text-xs text-garden-muted">{taskStatusLabel(job)}</span>
                        </div>
                        <h3 className="mt-1 truncate text-base font-semibold text-garden-ink">
                          {resolveTaskName(job)}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-garden-muted">
                          {resolveStatusCopy(job)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {job.status === "pending" || job.status === "processing" ? (
                          <AsyncButton
                            className="rounded-md border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                            disabled={isPending && !isJobPending}
                            isPending={isJobPending}
                            onClick={() => setConfirmation({ action: "cancel", jobId: job.id })}
                            pendingLabel="正在取消…"
                            type="button"
                          >
                            取消
                          </AsyncButton>
                        ) : null}
                        {job.kind === "image" && job.status === "pending" ? (
                          <AsyncButton
                            className="rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                            disabled={isPending && !isJobPending}
                            isPending={isJobPending}
                            onClick={() => void onRetry(job.id)}
                            pendingLabel="正在继续…"
                            type="button"
                          >
                            继续整理
                          </AsyncButton>
                        ) : null}
                        {job.status === "failed" ? (
                          <>
                            <button
                              className="rounded-md border border-garden-line px-4 py-2 text-sm font-semibold text-garden-danger hover:bg-garden-danger-soft disabled:opacity-50"
                              disabled={isPending}
                              onClick={() => setConfirmation({ action: "delete", jobId: job.id })}
                              type="button"
                            >
                              删除任务
                            </button>
                            <AsyncButton
                              className="rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                              disabled={isPending && !isJobPending}
                              isPending={isJobPending}
                              onClick={() => void onRetry(job.id)}
                              pendingLabel="正在重试…"
                              type="button"
                            >
                              重试
                            </AsyncButton>
                          </>
                        ) : null}
                        {job.kind === "sprout" &&
                        job.status === "awaiting_confirmation" &&
                        job.sourceFragmentId !== null ? (
                          <button
                            className="rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                            disabled={isPending}
                            onClick={(event) => onOpenCompleted(job, event.currentTarget)}
                            type="button"
                          >
                            回到原笔记
                          </button>
                        ) : null}
                        {job.status === "completed" && job.createdFragmentId !== null ? (
                          <button
                            className="rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                            disabled={isPending}
                            onClick={(event) => onOpenCompleted(job, event.currentTarget)}
                            type="button"
                          >
                            查看笔记
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex justify-end border-t border-garden-line px-6 py-4 sm:px-8">
          <button
            className="rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </footer>
      </ModalDialog>

      <ConfirmDialog
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
