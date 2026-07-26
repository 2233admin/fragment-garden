"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react";

import {
  ImageMediaValidationError,
  type SupportedImageMimeType,
  validateImageBlob,
} from "@/validation/media-image";

import { AsyncButton } from "../shared/AsyncButton";

export const IMAGE_INPUT_ACCEPT = "image/png,image/jpeg,image/webp";

export type ImageSelection = Readonly<{
  file: File;
  mimeType: SupportedImageMimeType;
  previewUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}>;

type CreateImageFragmentFormProps = Readonly<{
  errorMessage: string | null;
  image: ImageSelection | null;
  isOpen: boolean;
  isPending: boolean;
  onCancel: () => void;
  onImageChange: (image: ImageSelection | null) => void;
  onNoteChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  onValidationPendingChange?: (isPending: boolean) => void;
  note: string;
  title: string;
}>;

const VALIDATION_MESSAGES: Readonly<Record<ImageMediaValidationError["code"], string>> = {
  empty_file: "图片文件为空，尚未保存。",
  unsupported_media_type: "只支持 PNG、JPEG 或 WebP 图片。",
  file_too_large: "图片不能超过 10 MB。",
  invalid_image: "无法读取这张图片，请换一张可以正常打开的图片。",
  invalid_dimensions: "图片尺寸无效，请换一张图片。",
};

function resolveImageError(error: unknown): string {
  if (error instanceof ImageMediaValidationError) {
    return VALIDATION_MESSAGES[error.code];
  }

  return "无法读取这张图片，请换一张可以正常打开的图片。";
}

async function decodeImage(blob: Blob): Promise<void> {
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);
    bitmap.close();
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image could not be decoded"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function findClipboardImage(event: ClipboardEvent<HTMLDivElement>): File | null {
  for (const item of Array.from(event.clipboardData.items)) {
    if (item.kind !== "file" || !item.type.toLowerCase().startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file !== null) {
      return file;
    }
  }

  return null;
}

export function CreateImageFragmentForm({
  errorMessage,
  image,
  isOpen,
  isPending,
  onCancel,
  onImageChange,
  onNoteChange,
  onSubmit,
  onTitleChange,
  onValidationPendingChange,
  note,
  title,
}: CreateImageFragmentFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationGenerationRef = useRef(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const controlsDisabled = isPending || isValidating;

  useEffect(() => {
    if (image === null) {
      return;
    }

    return () => {
      URL.revokeObjectURL(image.previewUrl);
    };
  }, [image]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    validationGenerationRef.current += 1;
    let isActive = true;
    Promise.resolve().then(() => {
      if (!isActive) {
        return;
      }
      setValidationError(null);
      setIsValidating(false);
      onValidationPendingChange?.(false);
    });
    return () => {
      isActive = false;
    };
  }, [isOpen, onValidationPendingChange]);

  async function validateAndSelect(file: File): Promise<void> {
    const generation = validationGenerationRef.current + 1;
    validationGenerationRef.current = generation;
    setValidationError(null);
    setIsValidating(true);
    onValidationPendingChange?.(true);

    try {
      const metadata = await validateImageBlob(file);
      await decodeImage(file);

      if (validationGenerationRef.current !== generation) {
        return;
      }

      if (metadata.width === null || metadata.height === null) {
        throw new ImageMediaValidationError("invalid_dimensions", "Image dimensions are missing");
      }

      const previewUrl = URL.createObjectURL(file);
      onImageChange({
        file,
        height: metadata.height,
        mimeType: metadata.mimeType,
        previewUrl,
        sizeBytes: metadata.sizeBytes,
        width: metadata.width,
      });
    } catch (error) {
      if (validationGenerationRef.current !== generation) {
        return;
      }

      onImageChange(null);
      setValidationError(resolveImageError(error));
    } finally {
      if (validationGenerationRef.current === generation) {
        setIsValidating(false);
        onValidationPendingChange?.(false);
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    if (file !== undefined) {
      void validateAndSelect(file);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    const file = findClipboardImage(event);
    if (file === null) {
      return;
    }

    event.preventDefault();
    void validateAndSelect(file);
  }

  function removeImage(): void {
    validationGenerationRef.current += 1;
    setValidationError(null);
    setIsValidating(false);
    onValidationPendingChange?.(false);
    onImageChange(null);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  function handlePreviewError(): void {
    validationGenerationRef.current += 1;
    onImageChange(null);
    setValidationError("图片预览失败，原文件尚未保存。");
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        <div
          aria-label="图片输入区域，可粘贴图片"
          className="rounded-2xl border border-dashed border-garden-accent/45 bg-garden-canvas/45 p-4 focus-within:border-garden-accent focus-within:ring-2 focus-within:ring-garden-accent/25"
          onPaste={handlePaste}
          role="group"
          tabIndex={0}
        >
          {image !== null ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-garden-line bg-white">
                {/* Blob URLs cannot use next/image because they are local and short-lived. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="待保存的图片预览"
                  className="max-h-72 w-full object-contain"
                  onError={handlePreviewError}
                  src={image.previewUrl}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-garden-muted">
                <span className="min-w-0 truncate">{image.file.name || "粘贴的图片"}</span>
                <span>
                  {Math.ceil(image.sizeBytes / 1024)} KB · {image.width} × {image.height}
                </span>
              </div>
              <button
                className="rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                disabled={controlsDisabled}
                onClick={removeImage}
                type="button"
              >
                移除并重选
              </button>
            </div>
          ) : (
            <p className="text-sm leading-6 text-garden-muted">
              选择一张图片，或将图片粘贴到这里。只接受 PNG、JPEG 和 WebP，单张不超过 10 MB。
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              accept={IMAGE_INPUT_ACCEPT}
              className="sr-only"
              disabled={controlsDisabled}
              id="create-image-file"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <label
              className={`inline-flex cursor-pointer rounded-full border border-garden-accent px-4 py-2 text-sm font-semibold text-garden-accent hover:bg-garden-soft ${controlsDisabled ? "pointer-events-none opacity-50" : ""}`}
              htmlFor="create-image-file"
            >
              {isValidating ? "正在检查图片…" : image === null ? "选择图片" : "重新选择"}
            </label>
            <span className="text-xs text-garden-muted">也可以先点击这里，再按 Ctrl+V 粘贴</span>
          </div>
        </div>

        <div>
          <label
            className="mb-2 block text-sm font-semibold text-garden-ink"
            htmlFor="create-image-title"
          >
            标题（可选）
          </label>
          <input
            className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
            disabled={controlsDisabled}
            id="create-image-title"
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="不填写时使用临时标题"
            type="text"
            value={title}
          />
        </div>

        <div>
          <label
            className="mb-2 block text-sm font-semibold text-garden-ink"
            htmlFor="create-image-note"
          >
            补充说明（可选）
          </label>
          <textarea
            className="min-h-28 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
            disabled={controlsDisabled}
            id="create-image-note"
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="写下你想记住的背景或问题"
            value={note}
          />
        </div>

        {validationError !== null ? (
          <p
            aria-live="assertive"
            className="rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            {validationError}
          </p>
        ) : null}

        {errorMessage !== null ? (
          <p
            aria-live="assertive"
            className="rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-3 border-t border-garden-line px-6 py-4 sm:px-8">
        <button
          className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
          disabled={controlsDisabled}
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <AsyncButton
          className="rounded-full bg-garden-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
          disabled={image === null || isValidating}
          isPending={isPending}
          pendingLabel="正在准备…"
          type="submit"
        >
          开始整理
        </AsyncButton>
      </div>
    </form>
  );
}
