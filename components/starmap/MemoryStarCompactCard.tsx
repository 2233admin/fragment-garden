"use client";

/* eslint-disable @next/next/no-img-element */

import { Maximize2, X } from "lucide-react";
import { forwardRef, useId, useState, type RefObject } from "react";

import { useBlobObjectUrl } from "@/components/media/useBlobObjectUrl";
import type { MemoryStarDetailViewModel } from "@/data/queries/memory-star-detail-query";
import { markdownToPlainText } from "@/domain/fragments/content-markdown";

import { formatFragmentTimestamp } from "../fragments/fragment-presenters";
import type { MemoryStarCompactLayout } from "./memory-star-detail-layout";
import { isMemoryStarTitleVisuallyRedundant } from "./memory-star-detail-presentation";

export type MemoryStarDetailStatus = "loading" | "error" | "missing" | "ready";

type MemoryStarCompactCardProps = Readonly<{
  detail: MemoryStarDetailViewModel | null;
  expandButtonRef: RefObject<HTMLButtonElement | null>;
  layout: MemoryStarCompactLayout;
  onClose: () => void;
  onExpand: () => void;
  onRetry: () => void;
  shouldSkipEnterAnimation: boolean;
  status: MemoryStarDetailStatus;
}>;

const CONTENT_TYPE_LABELS = {
  audio: "语音记录",
  image: "图片记录",
  link: "链接记录",
  text: "文字记录",
} as const;

function deriveExcerpt(markdown: string): string {
  const plainText = markdownToPlainText(markdown).trim().replace(/\s+/gu, " ");
  if (plainText.length > 0) return plainText;
  return "这条记录暂时没有可预览的正文。";
}

function deriveSourceHostname(sourceUrl: string | null): string | null {
  if (sourceUrl === null) return null;
  try {
    return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return null;
  }
}

export const MemoryStarCompactCard = forwardRef<HTMLDivElement, MemoryStarCompactCardProps>(
  function MemoryStarCompactCard(
    {
      detail,
      expandButtonRef,
      layout,
      onClose,
      onExpand,
      onRetry,
      shouldSkipEnterAnimation,
      status,
    },
    forwardedRef,
  ) {
    const titleId = useId();
    const imageBlob = detail?.mediaAsset?.kind === "image" ? detail.mediaAsset.blob : null;
    const imageUrl = useBlobObjectUrl(imageBlob);
    const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
    const hasImagePreview = imageUrl !== null && failedImageUrl !== imageUrl;
    const sourceHostname = deriveSourceHostname(detail?.fragment.sourceUrl ?? null);
    const canExpand = status === "ready";
    const isTitleVisuallyRedundant =
      detail !== null &&
      isMemoryStarTitleVisuallyRedundant(
        detail.fragment.contentType,
        detail.fragment.title,
        detail.contentMarkdown,
      );

    return (
      <div
        aria-label={status === "loading" ? "正在读取记忆" : undefined}
        aria-labelledby={status === "loading" ? undefined : titleId}
        aria-modal="false"
        className={`memory-star-detail-surface memory-star-detail-popover${
          shouldSkipEnterAnimation ? " memory-star-detail-popover--handoff" : ""
        }`}
        data-anchored={layout.isAnchored || undefined}
        data-appearance="starmap"
        data-detail-presentation="compact"
        data-placement={layout.placement}
        ref={forwardedRef}
        role="dialog"
        style={{
          height: layout.height,
          left: layout.left,
          top: layout.top,
          width: layout.width,
        }}
      >
        <header className="memory-star-detail-preview-header">
          <div className="memory-star-detail-preview-meta" aria-hidden={detail === null}>
            <span>
              {detail === null ? "记忆记录" : CONTENT_TYPE_LABELS[detail.fragment.contentType]}
            </span>
            {detail !== null ? (
              <time dateTime={detail.fragment.createdAt}>
                {formatFragmentTimestamp(detail.fragment.createdAt)}
              </time>
            ) : null}
          </div>
          <button
            aria-label={canExpand ? "展开详情" : "关闭预览"}
            className="memory-star-detail-icon-button"
            data-tooltip={canExpand ? "展开详情" : "关闭预览"}
            onClick={canExpand ? onExpand : onClose}
            ref={expandButtonRef}
            type="button"
          >
            {canExpand ? (
              <Maximize2 aria-hidden="true" size={16} strokeWidth={1.7} />
            ) : (
              <X aria-hidden="true" size={17} strokeWidth={1.7} />
            )}
          </button>
        </header>

        {status === "loading" ? (
          <div aria-live="polite" className="memory-star-detail-preview-state" role="status">
            <span className="memory-star-detail-preview-loading-line" />
            <span className="memory-star-detail-preview-loading-line" />
            <span className="memory-star-detail-preview-loading-line" />
            <span className="sr-only">正在读取这颗星的记忆</span>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="memory-star-detail-preview-state" role="alert">
            <h2 id={titleId}>暂时无法读取这条记录</h2>
            <p>本地内容没有被修改，可以重新读取。</p>
            <button className="memory-star-detail-preview-retry" onClick={onRetry} type="button">
              重新读取
            </button>
          </div>
        ) : null}

        {status === "missing" ? (
          <div className="memory-star-detail-preview-state" role="alert">
            <h2 id={titleId}>这条记录已经无法找到</h2>
            <p>请关闭预览，再选择另一颗记忆星。</p>
          </div>
        ) : null}

        {status === "ready" && detail !== null ? (
          <div
            className="memory-star-detail-preview-content"
            data-content-type={detail.fragment.contentType}
          >
            {detail.fragment.contentType === "image" && hasImagePreview ? (
              <img
                alt=""
                aria-hidden="true"
                className="memory-star-detail-preview-image"
                onError={() => setFailedImageUrl(imageUrl)}
                src={imageUrl}
              />
            ) : null}
            <div className="memory-star-detail-preview-copy">
              <h2 className={isTitleVisuallyRedundant ? "sr-only" : undefined} id={titleId}>
                {detail.fragment.title}
              </h2>
              {detail.fragment.contentType === "link" && sourceHostname !== null ? (
                <p className="memory-star-detail-preview-source">{sourceHostname}</p>
              ) : null}
              <p className="memory-star-detail-preview-excerpt">
                {deriveExcerpt(detail.contentMarkdown)}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);
