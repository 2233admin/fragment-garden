import type { ContentProcessingJob } from "@/domain";

import { AsyncButton } from "../shared/AsyncButton";

type ContentProcessingTaskActionsProps = Readonly<{
  appearance: "default" | "starmap";
  busyJobId: string | null;
  job: ContentProcessingJob;
  onOpenCompleted: (job: ContentProcessingJob, triggerElement: HTMLButtonElement) => void;
  onRequestCancel: (jobId: string) => void;
  onRequestDelete: (jobId: string) => void;
  onRetry: (jobId: string) => Promise<void>;
}>;

const DEFAULT_SECONDARY_CLASS =
  "rounded-md border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50";
const DEFAULT_DANGER_CLASS =
  "rounded-md border border-garden-line px-4 py-2 text-sm font-semibold text-garden-danger hover:bg-garden-danger-soft disabled:opacity-50";
const DEFAULT_PRIMARY_CLASS =
  "rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60";

export function ContentProcessingTaskActions({
  appearance,
  busyJobId,
  job,
  onOpenCompleted,
  onRequestCancel,
  onRequestDelete,
  onRetry,
}: ContentProcessingTaskActionsProps) {
  const isPending = busyJobId !== null;
  const isJobPending = busyJobId === job.id;
  const isStarmap = appearance === "starmap";
  const secondaryClass = isStarmap
    ? "memory-processing-task-actions__button memory-processing-task-actions__button--secondary"
    : DEFAULT_SECONDARY_CLASS;
  const dangerClass = isStarmap
    ? "memory-processing-task-actions__button memory-processing-task-actions__button--danger"
    : DEFAULT_DANGER_CLASS;
  const primaryClass = isStarmap
    ? "memory-processing-task-actions__button memory-processing-task-actions__button--primary"
    : DEFAULT_PRIMARY_CLASS;

  return (
    <div className={isStarmap ? "memory-processing-task-actions" : "flex shrink-0 flex-wrap gap-2"}>
      {job.status === "pending" || job.status === "processing" ? (
        <AsyncButton
          className={secondaryClass}
          disabled={isPending && !isJobPending}
          isPending={isJobPending}
          onClick={() => onRequestCancel(job.id)}
          pendingLabel="正在取消…"
          type="button"
        >
          {isStarmap ? "取消任务" : "取消"}
        </AsyncButton>
      ) : null}
      {job.kind === "image" && job.status === "pending" ? (
        <AsyncButton
          className={primaryClass}
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
            className={dangerClass}
            disabled={isPending}
            onClick={() => onRequestDelete(job.id)}
            type="button"
          >
            删除任务
          </button>
          <AsyncButton
            className={primaryClass}
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
          className={primaryClass}
          disabled={isPending}
          onClick={(event) => onOpenCompleted(job, event.currentTarget)}
          type="button"
        >
          回到原笔记
        </button>
      ) : null}
      {job.status === "completed" && job.createdFragmentId !== null ? (
        <button
          className={primaryClass}
          disabled={isPending}
          onClick={(event) => onOpenCompleted(job, event.currentTarget)}
          type="button"
        >
          {isStarmap ? "查看这颗星" : "查看笔记"}
        </button>
      ) : null}
    </div>
  );
}
