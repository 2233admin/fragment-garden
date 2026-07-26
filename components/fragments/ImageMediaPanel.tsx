"use client";

// Local Blob URLs cannot be optimized by next/image. The URL is released when
// the media record changes or the panel unmounts.
/* eslint-disable @next/next/no-img-element */

import { useId, useState } from "react";
import { createPortal } from "react-dom";

import { useBlobObjectUrl } from "../media/useBlobObjectUrl";
import type { Fragment, MediaAsset } from "@/domain";

import { ModalDialog } from "../shared/ModalDialog";

type ImageMediaPanelProps = Readonly<{
  fragment: Fragment;
  mediaAsset: MediaAsset;
}>;

export function ImageMediaPanel({ fragment, mediaAsset }: ImageMediaPanelProps) {
  const previewTitleId = useId();
  const imageUrl = useBlobObjectUrl(mediaAsset.blob);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const isImageLoadFailed = imageUrl !== null && failedImageUrl === imageUrl;

  function handleImageLoadError(): void {
    setFailedImageUrl(imageUrl);
    setIsPreviewOpen(false);
  }

  return (
    <>
      <section aria-labelledby={`image-title-${mediaAsset.id}`}>
        <h3
          className="mb-3 text-sm font-semibold text-garden-muted"
          id={`image-title-${mediaAsset.id}`}
        >
          原始图片
        </h3>
        {imageUrl !== null && !isImageLoadFailed ? (
          <button
            className="block w-full overflow-hidden rounded-lg border border-garden-line bg-garden-canvas/35 text-left"
            onClick={() => setIsPreviewOpen(true)}
            type="button"
          >
            <img
              alt={`用户上传的图片：${fragment.title}`}
              className="max-h-[32rem] w-full object-contain"
              onError={handleImageLoadError}
              src={imageUrl}
            />
            <span className="block border-t border-garden-line bg-white px-4 py-2 text-xs font-semibold text-garden-muted">
              查看大图
            </span>
          </button>
        ) : (
          <p className="border-y border-dashed border-garden-line py-5 text-sm text-garden-muted">
            原图片暂时无法读取。笔记正文和其他内容仍可使用。
          </p>
        )}
      </section>

      {typeof document !== "undefined"
        ? createPortal(
            <ModalDialog
              className="m-auto max-h-[94vh] w-[min(96vw,70rem)] rounded-lg border border-garden-line bg-black/90 p-3 shadow-2xl"
              isOpen={isPreviewOpen}
              labelledBy={previewTitleId}
              onRequestClose={() => setIsPreviewOpen(false)}
            >
              <h2 className="sr-only" id={previewTitleId}>
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
