"use client";

import type { FragmentCardViewModel } from "@/data/queries/fragment-card-query";

import { formatFragmentTimestamp } from "./fragment-presenters";
import { ImageCardThumbnail } from "./ImageCardThumbnail";

type FragmentCardProps = {
  fragment: FragmentCardViewModel;
  isOpening: boolean;
  onOpen: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
};

function resolveExcerpt(fragment: FragmentCardViewModel): string {
  if (fragment.excerpt.length > 0) {
    return fragment.excerpt;
  }

  if (fragment.contentType === "image") {
    return "这张图片暂时没有可用的整理笔记。";
  }
  if (fragment.contentType === "audio") {
    return "这段历史录音暂时没有可预览的文字。";
  }
  return "这条笔记暂时没有可预览的正文。";
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1_000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function FragmentCard({ fragment, isOpening, onOpen }: FragmentCardProps) {
  const duration = formatDuration(fragment.mediaDurationMs);

  return (
    <li>
      <button
        aria-busy={isOpening}
        aria-label={`打开笔记：${fragment.title}`}
        className="group flex h-[21rem] w-full flex-col overflow-hidden rounded-lg border border-garden-line bg-garden-paper p-4 text-left shadow-[0_10px_26px_rgba(24,55,43,0.06)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-garden-accent/45 hover:shadow-[0_14px_30px_rgba(24,55,43,0.1)] disabled:cursor-wait disabled:opacity-65"
        disabled={isOpening}
        onClick={(event) => onOpen(fragment.id, event.currentTarget)}
        type="button"
      >
        {fragment.contentType === "image" ? (
          <ImageCardThumbnail blob={fragment.mediaBlob} title={fragment.title} />
        ) : null}

        <div className={fragment.contentType === "image" ? "mt-3" : ""}>
          {fragment.contentType === "link" ? (
            <p className="mb-2 truncate text-xs font-semibold text-garden-accent">
              {fragment.sourceHostname ?? "外部链接"}
            </p>
          ) : null}
          {fragment.contentType === "audio" ? (
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-garden-accent">
              <span aria-hidden="true" className="text-base">
                ♫
              </span>
              历史语音{duration === null ? "" : ` · ${duration}`}
            </p>
          ) : null}
          <h3 className="line-clamp-2 min-h-14 break-words font-display text-xl leading-7 font-semibold text-garden-ink">
            {fragment.title}
          </h3>
        </div>

        <p className="mt-3 line-clamp-3 overflow-hidden text-sm leading-6 text-garden-muted">
          {resolveExcerpt(fragment)}
        </p>

        <p className="mt-auto shrink-0 pt-4 text-xs text-garden-muted">
          更新于{" "}
          <time dateTime={fragment.updatedAt}>{formatFragmentTimestamp(fragment.updatedAt)}</time>
          {isOpening ? " · 正在打开" : ""}
        </p>
      </button>
    </li>
  );
}
