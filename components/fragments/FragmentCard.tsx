"use client";

import { useId, useState } from "react";

import type { FragmentAnalysisStatus, MediaProcessingStatus } from "@/domain";
import type { FragmentCardViewModel } from "@/data/queries/fragment-card-query";

import {
  COMPLETION_STATUS_LABELS,
  LIFECYCLE_STATUS_LABELS,
  PLANT_STAGE_LABELS,
  formatFragmentTimestamp,
  resolveGrowthStep,
} from "./fragment-presenters";

type FragmentCardProps = {
  fragment: FragmentCardViewModel;
  isOpening: boolean;
  onOpen: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  onRetryLinkImport?: (fragmentId: string) => Promise<void>;
};

const GROWTH_TRACK_STEPS = [0, 1, 2, 3] as const;

const LINK_ANALYSIS_LABELS: Readonly<Record<FragmentAnalysisStatus, string>> = {
  not_required: "未读取",
  pending: "正在读取",
  completed: "已完成",
  failed: "读取失败",
};

const LINK_STATUS_DOT_CLASSES: Readonly<Record<FragmentAnalysisStatus, string>> = {
  not_required: "bg-garden-muted",
  pending: "bg-garden-accent",
  completed: "bg-garden-accent-strong",
  failed: "bg-garden-danger",
};

const MEDIA_PROCESSING_LABELS: Readonly<Record<MediaProcessingStatus, string>> = {
  local_only: "仅保存在本地",
  pending: "等待处理",
  processing: "正在处理",
  completed: "处理完成",
  failed: "处理失败",
};

function resolveMediaProcessingLabel(status: MediaProcessingStatus | null): string {
  return status === null ? MEDIA_PROCESSING_LABELS.pending : MEDIA_PROCESSING_LABELS[status];
}

function resolveExcerpt(fragment: FragmentCardViewModel): string {
  if (fragment.contentType === "image") {
    switch (fragment.mediaProcessingStatus) {
      case "completed":
        return "图片已保存在本地，可以打开详情查看分析结果。";
      case "processing":
        return "图片已先保存在本地，正在等待分析结果。";
      case "failed":
        return "图片已保留在本地，分析失败后仍可重新尝试。";
      case "local_only":
        return "图片只保存在本地，没有发送给 OpenAI。";
      default:
        return "图片已保存在本地。";
    }
  }
  if (fragment.contentType === "audio") {
    switch (fragment.mediaProcessingStatus) {
      case "completed":
        return "语音已经保存在本地，可以打开详情查看转写。";
      case "processing":
        return "语音已经先保存在本地，正在等待转写结果。";
      case "failed":
        return "语音仍保留在本地，转写失败后可以重新尝试。";
      case "local_only":
        return "语音只保存在本地，没有发送给 OpenAI。";
      default:
        return "语音已经保存在本地。";
    }
  }
  if (fragment.excerpt.length > 0) {
    return fragment.excerpt;
  }

  if (fragment.contentType !== "link") {
    return "这条碎片还没有可预览的文字。";
  }

  switch (fragment.analysisStatus) {
    case "pending":
      return "原链接已经保存在本地，内容仍在读取中。";
    case "failed":
      return "原链接已经保留，可以稍后重新读取或手动补充。";
    case "completed":
    case "not_required":
      return "这条链接还没有可预览的摘要。";
  }
}

export function FragmentCard({
  fragment,
  isOpening,
  onOpen,
  onRetryLinkImport,
}: FragmentCardProps) {
  const statusDescriptionId = useId();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const growthStep = resolveGrowthStep(fragment.plantStage);
  const stageLabel = PLANT_STAGE_LABELS[fragment.plantStage];
  const isLink = fragment.contentType === "link";
  const isImage = fragment.contentType === "image";
  const isAudio = fragment.contentType === "audio";

  async function retryLinkImport(): Promise<void> {
    if (onRetryLinkImport === undefined || isRetrying) {
      return;
    }

    setIsRetrying(true);
    setRetryError(null);

    try {
      await onRetryLinkImport(fragment.id);
    } catch {
      setRetryError("重新读取没有启动，原链接仍保存在本地。请稍后重试。");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <li>
      <article
        aria-describedby={statusDescriptionId}
        className="flex min-h-72 w-full flex-col rounded-2xl border border-garden-line bg-garden-paper p-5 text-left shadow-[0_14px_36px_rgba(24,55,43,0.07)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-garden-accent/45 hover:shadow-[0_18px_40px_rgba(24,55,43,0.1)]"
      >
        <span className="sr-only" id={statusDescriptionId}>
          生命周期状态：{LIFECYCLE_STATUS_LABELS[fragment.lifecycleStatus]}。完成状态：
          {COMPLETION_STATUS_LABELS[fragment.completionStatus]}。成长阶段：{stageLabel}
          。成长分：{fragment.growthScore}。
          {isLink ? `链接读取状态：${LINK_ANALYSIS_LABELS[fragment.analysisStatus]}。` : ""}
          {isAudio
            ? `语音转写状态：${resolveMediaProcessingLabel(fragment.mediaProcessingStatus)}。`
            : ""}
          {fragment.lifecycleStatus !== "archived" && fragment.isPlacedInGarden === false
            ? "花园位置已满，暂未放置植物。"
            : ""}
        </span>

        <div className="flex w-full items-start justify-between gap-4">
          <h3 className="font-display text-xl leading-7 font-semibold text-garden-ink">
            {fragment.title}
          </h3>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <span className="rounded-full bg-garden-soft px-2.5 py-1 text-xs font-semibold text-garden-accent-strong">
              {LIFECYCLE_STATUS_LABELS[fragment.lifecycleStatus]}
            </span>
            {fragment.completionStatus === "completed" ? (
              <span className="rounded-full bg-garden-accent/15 px-2.5 py-1 text-xs font-semibold text-garden-accent-strong">
                {COMPLETION_STATUS_LABELS.completed}
              </span>
            ) : null}
          </div>
        </div>

        {isLink ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-garden-line/85 bg-garden-canvas/55 px-3 py-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-garden-accent/25 bg-garden-paper text-base font-semibold text-garden-accent"
            >
              ↗
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-garden-ink">
                {fragment.sourceHostname ?? "外部链接"}
              </p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-garden-muted">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${LINK_STATUS_DOT_CLASSES[fragment.analysisStatus]}`}
                />
                {LINK_ANALYSIS_LABELS[fragment.analysisStatus]}
              </p>
            </div>
          </div>
        ) : null}

        {isImage ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-garden-line/85 bg-garden-canvas/55 px-3 py-2.5">
            <span aria-hidden="true" className="text-xl">
              ▧
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-garden-ink">图片</p>
              <p className="mt-1 text-xs text-garden-muted">
                {fragment.mediaProcessingStatus === "completed"
                  ? "分析完成"
                  : fragment.mediaProcessingStatus === "processing"
                    ? "正在分析"
                    : fragment.mediaProcessingStatus === "local_only"
                      ? "仅本地保存"
                      : fragment.mediaProcessingStatus === "failed"
                        ? "分析失败"
                        : "等待处理"}
              </p>
            </div>
          </div>
        ) : null}

        {isAudio ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-garden-line/85 bg-garden-canvas/55 px-3 py-2.5">
            <span aria-hidden="true" className="text-xl">
              ♫
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-garden-ink">语音</p>
              <p className="mt-1 text-xs text-garden-muted">
                {fragment.mediaDurationMs !== null
                  ? `时长 ${Math.floor(fragment.mediaDurationMs / 60_000)}:${Math.floor(
                      (fragment.mediaDurationMs % 60_000) / 1_000,
                    )
                      .toString()
                      .padStart(2, "0")}`
                  : "时长未知"}
                {" · "}
                {fragment.mediaProcessingStatus === "completed"
                  ? "转写完成"
                  : fragment.mediaProcessingStatus === "processing"
                    ? "正在转写"
                    : fragment.mediaProcessingStatus === "local_only"
                      ? "仅本地"
                      : fragment.mediaProcessingStatus === "failed"
                        ? "转写失败"
                        : "等待处理"}
              </p>
            </div>
          </div>
        ) : null}

        <p className="mt-3 line-clamp-3 min-h-18 text-sm leading-6 text-garden-muted">
          {resolveExcerpt(fragment)}
        </p>

        {isLink && fragment.analysisStatus === "failed" ? (
          <p className="mt-2 rounded-xl bg-garden-danger-soft/65 px-3 py-2 text-xs leading-5 text-garden-danger">
            {fragment.linkImportErrorMessage ?? "链接已经种下，但暂时没能读取完整内容。"}
          </p>
        ) : null}

        <div className="mt-5 w-full rounded-xl border border-garden-line/80 bg-garden-canvas/55 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-garden-accent-strong">
            <span>成长阶段：{stageLabel}</span>
            <span>成长分：{fragment.growthScore}</span>
          </div>
          <div aria-hidden="true" className="mt-3 grid grid-cols-4 items-center gap-2">
            {GROWTH_TRACK_STEPS.map((step) => (
              <span
                className={`h-1.5 rounded-full ${
                  step <= growthStep ? "bg-garden-accent" : "bg-garden-line"
                }`}
                key={step}
              />
            ))}
          </div>
        </div>

        {fragment.lifecycleStatus !== "archived" && fragment.isPlacedInGarden === false ? (
          <p className="mt-3 rounded-xl border border-garden-line bg-garden-soft/65 px-3.5 py-3 text-xs leading-5 text-garden-muted">
            花园位置已满，内容仍可在卡片模式使用，暂未放置植物。
          </p>
        ) : null}

        <div className="mt-auto pt-5 text-xs leading-5 text-garden-muted">
          <p>
            创建于{" "}
            <time dateTime={fragment.createdAt}>{formatFragmentTimestamp(fragment.createdAt)}</time>
          </p>
          <p className="mt-1">
            最近互动{" "}
            <time dateTime={fragment.lastInteractedAt}>
              {formatFragmentTimestamp(fragment.lastInteractedAt)}
            </time>
          </p>
          <span className="mt-2 inline-flex rounded-full border border-garden-line px-2.5 py-1">
            内容状态：
            {COMPLETION_STATUS_LABELS[fragment.completionStatus]}
          </span>
        </div>

        {retryError !== null ? (
          <p
            aria-live="assertive"
            className="mt-3 text-xs font-semibold leading-5 text-garden-danger"
            role="alert"
          >
            {retryError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-garden-line pt-4">
          {isLink && fragment.sourceUrl !== null ? (
            <a
              className="rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
              href={fragment.sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              打开原链接
            </a>
          ) : null}
          {isLink && fragment.analysisStatus === "failed" && onRetryLinkImport !== undefined ? (
            <button
              aria-busy={isRetrying}
              className="rounded-full border border-garden-accent px-4 py-2 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:cursor-wait disabled:opacity-60"
              disabled={isRetrying || isOpening}
              onClick={() => void retryLinkImport()}
              type="button"
            >
              {isRetrying ? "正在重新读取…" : "重新读取"}
            </button>
          ) : null}
          <button
            aria-busy={isOpening}
            aria-label={`打开碎片：${fragment.title}`}
            className="rounded-full bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={isOpening || isRetrying}
            onClick={(event) => onOpen(fragment.id, event.currentTarget)}
            type="button"
          >
            {isOpening ? "正在打开…" : "打开详情"}
          </button>
        </div>
      </article>
    </li>
  );
}
