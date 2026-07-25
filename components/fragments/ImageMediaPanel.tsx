"use client";

// Local Blob URLs cannot be optimized by next/image; keep the native element and
// revoke the URL in useBlobUrl when the media record changes or the panel unmounts.
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import type { Fragment, MediaAsset } from "@/domain";
import { queryLocalSettings } from "@/data/queries/companion-query";
import { acceptImageDisclosure } from "@/services/accept-image-disclosure";
import { processImageAnalysis, setImageLocalOnly } from "@/services/image-media-processing";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";
import { ImageDisclosureDialog } from "./ImageDisclosureDialog";

type ImageMediaPanelProps = Readonly<{
  fragment: Fragment;
  mediaAsset: MediaAsset;
}>;

function useBlobUrl(blob: Blob | null): string | null {
  const [resource, setResource] = useState<{ blob: Blob | null; url: string | null }>({
    blob: null,
    url: null,
  });

  useEffect(() => {
    let nextUrl: string | null = null;
    if (blob !== null && typeof URL.createObjectURL === "function") {
      try {
        nextUrl = URL.createObjectURL(blob);
      } catch {
        nextUrl = null;
      }
    }

    let isActive = true;
    Promise.resolve().then(() => {
      if (isActive) {
        setResource({ blob, url: nextUrl });
      }
    });

    return () => {
      isActive = false;
      if (nextUrl !== null) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [blob]);

  return resource.blob === blob ? resource.url : null;
}

const STATUS_LABELS = {
  local_only: "仅保存在本地",
  pending: "等待处理",
  processing: "正在分析",
  completed: "分析完成",
  failed: "分析失败",
} as const;

export function ImageMediaPanel({ fragment, mediaAsset }: ImageMediaPanelProps) {
  const titleId = useId();
  const imageUrl = useBlobUrl(mediaAsset.blob);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const isDeleted = fragment.lifecycleStatus === "deleted";
  const isImageLoadFailed = imageUrl !== null && failedImageUrl === imageUrl;

  function handleImageLoadError(): void {
    setFailedImageUrl(imageUrl);
    setIsPreviewOpen(false);
  }

  async function runAnalysis(): Promise<void> {
    if (isPending || isDeleted) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      const settings = await queryLocalSettings();
      if (settings.imageAiDisclosureAcceptedAt === null) {
        setIsDisclosureOpen(true);
        return;
      }
      const result = await processImageAnalysis(mediaAsset.id);
      if (result === null) {
        setErrorMessage("这次图片分析结果已过期，原图仍保存在本地，可以稍后重试。");
      }
    } catch {
      setErrorMessage("图片仍保存在本地，但分析暂时失败，可以稍后重试。");
    } finally {
      setIsPending(false);
    }
  }

  async function acceptDisclosure(): Promise<void> {
    if (isPending || isDeleted) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      await acceptImageDisclosure({ now: new Date().toISOString() });
      setIsDisclosureOpen(false);
      const result = await processImageAnalysis(mediaAsset.id);
      if (result === null) {
        setErrorMessage("这次图片分析结果已过期，原图仍保存在本地，可以稍后重试。");
      }
    } catch {
      setErrorMessage("这次选择没有保存，图片仍只保存在本地。请重试。");
    } finally {
      setIsPending(false);
    }
  }

  async function chooseLocalOnly(): Promise<void> {
    if (isPending || isDeleted) return;
    setIsPending(true);
    try {
      await setImageLocalOnly(mediaAsset.id);
      setIsDisclosureOpen(false);
      setErrorMessage(null);
    } catch {
      setErrorMessage("暂时无法更新处理状态，图片仍然保存在本地。");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-garden-line bg-garden-canvas/35 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-xl font-semibold text-garden-ink">图片</h3>
          <span className="text-xs font-semibold text-garden-muted">
            {STATUS_LABELS[mediaAsset.processingStatus]}
          </span>
        </div>
        {mediaAsset.errorCode === "request_interrupted" ? (
          <p aria-live="polite" className="mt-2 text-sm text-garden-muted" role="status">
            上次处理未完成，可以重试。
          </p>
        ) : null}
        {imageUrl !== null && !isImageLoadFailed ? (
          <button
            className="mt-4 block w-full overflow-hidden rounded-xl border border-garden-line bg-white text-left"
            onClick={() => setIsPreviewOpen(true)}
            type="button"
          >
            <img
              alt={`用户上传的图片：${fragment.title}`}
              className="max-h-96 w-full object-contain"
              onError={handleImageLoadError}
              src={imageUrl}
            />
          </button>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-garden-line px-4 py-6 text-sm text-garden-muted">
            图片暂时无法读取，但原始记录仍保存在本地。
          </p>
        )}
        <dl className="mt-4 grid gap-2 text-sm text-garden-muted sm:grid-cols-2">
          <div>
            <dt className="font-semibold">文件类型</dt>
            <dd>{mediaAsset.mimeType}</dd>
          </div>
          <div>
            <dt className="font-semibold">文件大小</dt>
            <dd>{Math.ceil(mediaAsset.sizeBytes / 1024)} KB</dd>
          </div>
        </dl>
        {mediaAsset.summary !== null ? (
          <div className="mt-5">
            <h4 className="text-sm font-semibold text-garden-ink">图片摘要</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-garden-ink">
              {mediaAsset.summary}
            </p>
          </div>
        ) : null}
        {mediaAsset.visibleText !== null ? (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-garden-ink">图片中的可见文字</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-garden-ink">
              {mediaAsset.visibleText}
            </p>
          </div>
        ) : null}
        {errorMessage !== null ? (
          <p aria-live="polite" className="mt-4 text-sm leading-6 text-garden-danger" role="status">
            {errorMessage}
          </p>
        ) : null}
        {!isDeleted && mediaAsset.processingStatus !== "processing" ? (
          <AsyncButton
            className="mt-5 rounded-full border border-garden-accent px-4 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
            isPending={isPending}
            onClick={() => void runAnalysis()}
            pendingLabel="正在准备…"
            type="button"
          >
            {mediaAsset.processingStatus === "completed" ? "重新分析" : "分析图片"}
          </AsyncButton>
        ) : null}
      </section>

      <ImageDisclosureDialog
        errorMessage={errorMessage}
        isOpen={isDisclosureOpen}
        isPending={isPending}
        onAccept={() => void acceptDisclosure()}
        onCancel={() => {
          if (!isPending) setIsDisclosureOpen(false);
        }}
        onLocalOnly={() => void chooseLocalOnly()}
      />

      {typeof document !== "undefined"
        ? createPortal(
            <ModalDialog
              className="m-auto max-h-[94vh] w-[min(96vw,70rem)] rounded-2xl border border-garden-line bg-black/90 p-3 shadow-2xl"
              isOpen={isPreviewOpen}
              labelledBy={titleId}
              onRequestClose={() => setIsPreviewOpen(false)}
            >
              <h2 className="sr-only" id={titleId}>
                {fragment.title}的大图
              </h2>
              {imageUrl !== null && !isImageLoadFailed ? (
                <img
                  alt={`用户上传的图片：${fragment.title}`}
                  className="max-h-[88vh] w-full object-contain"
                  onError={handleImageLoadError}
                  src={imageUrl}
                />
              ) : null}
            </ModalDialog>,
            document.body,
          )
        : null}
    </>
  );
}
