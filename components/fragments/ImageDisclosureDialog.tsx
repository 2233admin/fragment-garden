"use client";

import { useId } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

type ImageDisclosureDialogProps = Readonly<{
  allowLocalOnly?: boolean;
  isOpen: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onAccept: () => void;
  onLocalOnly: () => void;
  onCancel: () => void;
}>;

export function ImageDisclosureDialog({
  allowLocalOnly = true,
  errorMessage,
  isOpen,
  isPending,
  onAccept,
  onCancel,
  onLocalOnly,
}: ImageDisclosureDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,36rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl backdrop:bg-black/30"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
    >
      <div className="p-6 sm:p-7">
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
            autoFocus
            className="rounded-full border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          {allowLocalOnly ? (
            <button
              className="rounded-full border border-garden-accent px-4 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
              disabled={isPending}
              onClick={onLocalOnly}
              type="button"
            >
              仅保存在本地
            </button>
          ) : null}
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
    </ModalDialog>
  );
}
