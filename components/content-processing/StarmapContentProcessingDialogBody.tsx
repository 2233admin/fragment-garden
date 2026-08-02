import { X } from "lucide-react";

import type { ContentProcessingJob } from "@/domain";

import {
  resolveProcessingStatusCopy,
  resolveProcessingStatusLabel,
  resolveProcessingTaskKind,
  resolveProcessingTaskName,
} from "./content-processing-presentation";
import { ContentProcessingTaskActions } from "./ContentProcessingTaskActions";
import {
  StarmapProcessingVisual,
  type StarmapProcessingVisualState,
} from "./StarmapProcessingVisual";

type StarmapContentProcessingDialogBodyProps = Readonly<{
  busyJobId: string | null;
  descriptionId: string;
  errorMessage: string | null;
  jobs: readonly ContentProcessingJob[];
  onClose: () => void;
  onOpenCompleted: (job: ContentProcessingJob, triggerElement: HTMLButtonElement) => void;
  onRequestCancel: (jobId: string) => void;
  onRequestDelete: (jobId: string) => void;
  onRetry: (jobId: string) => Promise<void>;
  titleId: string;
}>;

function resolveVisualState(job: ContentProcessingJob): StarmapProcessingVisualState {
  if (job.status === "failed") return "failed";
  if (job.status === "completed" || job.status === "awaiting_confirmation") return "completed";
  if (job.status === "pending") return "waiting";
  return "active";
}

function resolveDialogTitle(jobs: readonly ContentProcessingJob[]): string {
  if (jobs.length !== 1) return "记忆星整理中";
  const job = jobs[0];
  if (job?.status === "failed") return "这次转化停在了途中";
  if (job?.status === "completed" || job?.status === "awaiting_confirmation") {
    return "一颗记忆星已经点亮";
  }
  return "一颗记忆星正在形成";
}

function resolveLiveSummary(jobs: readonly ContentProcessingJob[]): string {
  const activeCount = jobs.filter(
    (job) => job.status === "pending" || job.status === "processing",
  ).length;
  const failedCount = jobs.filter((job) => job.status === "failed").length;
  const completedCount = jobs.filter(
    (job) => job.status === "completed" || job.status === "awaiting_confirmation",
  ).length;
  if (activeCount > 0) return `${activeCount} 条内容正在整理。`;
  if (failedCount > 0) return `${failedCount} 条内容需要处理。`;
  if (completedCount > 0) return `${completedCount} 条内容已经整理完成。`;
  return "现在没有需要查看的整理任务。";
}

type StarmapTaskProps = Readonly<{
  busyJobId: string | null;
  isCompact: boolean;
  job: ContentProcessingJob;
  onOpenCompleted: (job: ContentProcessingJob, triggerElement: HTMLButtonElement) => void;
  onRequestCancel: (jobId: string) => void;
  onRequestDelete: (jobId: string) => void;
  onRetry: (jobId: string) => Promise<void>;
}>;

function StarmapTask({
  busyJobId,
  isCompact,
  job,
  onOpenCompleted,
  onRequestCancel,
  onRequestDelete,
  onRetry,
}: StarmapTaskProps) {
  const visualState = resolveVisualState(job);

  return (
    <li
      className={
        isCompact ? "memory-processing-task is-compact" : "memory-processing-task is-focus"
      }
      data-processing-state={visualState}
      data-task-job-id={job.id}
    >
      <StarmapProcessingVisual
        className={
          isCompact
            ? "memory-processing-task__visual is-compact"
            : "memory-processing-task__visual is-focus"
        }
        jobId={job.id}
        state={visualState}
        testId="starmap-processing-visual"
      />

      <div className="memory-processing-task__content">
        <p className="memory-processing-task__meta">
          <span>{resolveProcessingTaskKind(job)}</span>
          <span aria-hidden="true">·</span>
          <span>{resolveProcessingStatusLabel(job)}</span>
        </p>
        <h3>{resolveProcessingTaskName(job)}</h3>
        <p className="memory-processing-task__description">{resolveProcessingStatusCopy(job)}</p>
        <ContentProcessingTaskActions
          appearance="starmap"
          busyJobId={busyJobId}
          job={job}
          onOpenCompleted={onOpenCompleted}
          onRequestCancel={onRequestCancel}
          onRequestDelete={onRequestDelete}
          onRetry={onRetry}
        />
      </div>
    </li>
  );
}

export function StarmapContentProcessingDialogBody({
  busyJobId,
  descriptionId,
  errorMessage,
  jobs,
  onClose,
  onOpenCompleted,
  onRequestCancel,
  onRequestDelete,
  onRetry,
  titleId,
}: StarmapContentProcessingDialogBodyProps) {
  const hasMultipleJobs = jobs.length > 1;

  return (
    <div className="memory-processing-hub">
      <header className="memory-processing-hub__header">
        <div>
          <p className="memory-processing-hub__eyebrow">内容转化</p>
          <h2 id={titleId}>{resolveDialogTitle(jobs)}</h2>
          <p id={descriptionId}>关闭窗口不会中断正在进行的整理。</p>
        </div>
        <button
          aria-label="关闭内容整理"
          autoFocus
          className="memory-processing-hub__close"
          disabled={busyJobId !== null}
          onClick={onClose}
          title="关闭"
          type="button"
        >
          <X aria-hidden="true" size={17} strokeWidth={1.7} />
        </button>
      </header>

      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {resolveLiveSummary(jobs)}
      </p>

      {errorMessage !== null ? (
        <p className="memory-processing-hub__error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <div className="memory-processing-hub__empty">
          <span aria-hidden="true">✦</span>
          <p>现在没有需要查看的整理任务。</p>
        </div>
      ) : (
        <ul
          aria-label={hasMultipleJobs ? "内容整理任务" : "当前内容整理任务"}
          className={
            hasMultipleJobs
              ? "memory-processing-hub__tasks is-multiple"
              : "memory-processing-hub__tasks"
          }
        >
          {jobs.map((job) => (
            <StarmapTask
              busyJobId={busyJobId}
              isCompact={hasMultipleJobs}
              job={job}
              key={job.id}
              onOpenCompleted={onOpenCompleted}
              onRequestCancel={onRequestCancel}
              onRequestDelete={onRequestDelete}
              onRetry={onRetry}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
