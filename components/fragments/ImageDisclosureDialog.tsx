"use client";

import { useEffect, useId, useRef } from "react";

import { AsyncButton } from "../shared/AsyncButton";

type ImageDisclosureDialogProps = Readonly<{
  isOpen: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onAccept: () => void;
  onLocalOnly: () => void;
  onCancel: () => void;
}>;

export function ImageDisclosureDialog({
  errorMessage,
  isOpen,
  isPending,
  onAccept,
  onCancel,
  onLocalOnly,
}: ImageDisclosureDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
      previousFocusRef.current = null;
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => cancelButtonRef.current?.focus());
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (!isPending) onCancel();
        }
      }}
      role="dialog"
      tabIndex={-1}
    >
      <div className="w-[min(92vw,36rem)] rounded-2xl border border-garden-line bg-garden-paper p-6 shadow-2xl sm:p-7">
        <p className="text-xs font-semibold tracking-[0.16em] text-garden-accent uppercase">
          图片分析说明
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
          发送当前图片前，请先确认
        </h2>
        <p className="mt-4 text-sm leading-7 text-garden-ink" id={descriptionId}>
          为了理解图片内容，当前图片会通过 OpenAI
          服务进行分析。不会发送花园中的其他碎片。原始图片仍保存在当前浏览器中。请不要上传不希望由第三方处理的私密图片。
        </p>
        {errorMessage !== null ? (
          <p
            aria-live="assertive"
            className="mt-4 rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-full border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-full border border-garden-accent px-4 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onLocalOnly}
            type="button"
          >
            仅保存在本地
          </button>
          <AsyncButton
            className="rounded-full bg-garden-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
            isPending={isPending}
            onClick={onAccept}
            pendingLabel="正在保存选择…"
            type="button"
          >
            同意并分析
          </AsyncButton>
        </div>
      </div>
    </div>
  );
}
