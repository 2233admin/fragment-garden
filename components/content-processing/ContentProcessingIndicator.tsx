"use client";

import type { RefObject } from "react";

import type { ContentProcessingJob } from "@/domain";

type ContentProcessingIndicatorProps = Readonly<{
  buttonRef: RefObject<HTMLButtonElement | null>;
  jobs: readonly ContentProcessingJob[];
  onOpen: () => void;
}>;

function countJobs(
  jobs: readonly ContentProcessingJob[],
  status: ContentProcessingJob["status"],
): number {
  return jobs.filter((job) => job.status === status).length;
}

function resolveSummary(jobs: readonly ContentProcessingJob[]): string {
  const activeCount = jobs.filter(
    (job) => job.status === "pending" || job.status === "processing",
  ).length;
  const failedCount = countJobs(jobs, "failed");
  const completedCount = countJobs(jobs, "completed");

  if (activeCount > 0) {
    return `正在整理 ${activeCount} 条内容`;
  }
  if (failedCount > 0) {
    return `${failedCount} 条内容需要处理`;
  }
  if (completedCount > 0) {
    return completedCount === 1 ? "新笔记已经整理好了" : `${completedCount} 条新笔记已经整理好了`;
  }

  return "查看内容整理任务";
}

export function ContentProcessingIndicator({
  buttonRef,
  jobs,
  onOpen,
}: ContentProcessingIndicatorProps) {
  if (jobs.length === 0) {
    return null;
  }

  const isProcessing = jobs.some((job) => job.status === "pending" || job.status === "processing");

  return (
    <div className="mx-auto mt-4 max-w-[960px] border-y border-garden-line bg-garden-paper/70 px-1 py-2">
      <button
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left hover:bg-garden-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garden-accent"
        onClick={onOpen}
        ref={buttonRef}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              isProcessing ? "bg-garden-accent" : "bg-garden-muted/55"
            }`}
          />
          <span className="truncate text-sm font-semibold text-garden-ink">
            {resolveSummary(jobs)}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-garden-accent">查看</span>
      </button>
    </div>
  );
}
