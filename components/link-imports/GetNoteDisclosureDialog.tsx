"use client";

import { useId } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog, type DialogAppearance } from "../shared/ModalDialog";

type GetNoteDisclosureDialogProps = {
  appearance?: DialogAppearance;
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  onAccept: () => void;
  onCancel: () => void;
};

export function GetNoteDisclosureDialog({
  appearance = "default",
  errorMessage,
  isOpen,
  isPending,
  onAccept,
  onCancel,
}: GetNoteDisclosureDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      appearance={appearance}
      className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-garden-accent/25 bg-garden-soft text-lg font-semibold text-garden-accent"
          >
            ↗
          </span>
          <div>
            <p className="memory-dialog__eyebrow text-xs font-semibold tracking-[0.16em] text-garden-accent uppercase">
              第三方处理说明
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
              读取链接前，请先确认
            </h2>
          </div>
        </div>

        <p className="mt-5 text-sm leading-7 text-garden-ink" id={descriptionId}>
          链接内容将通过得到大脑服务读取和分析。请不要提交不希望由第三方处理的私密内容。
        </p>
        <p className="mt-3 rounded-xl border border-garden-line bg-garden-canvas/55 px-4 py-3 text-xs leading-5 text-garden-muted">
          同意状态只保存在当前浏览器。清空本地数据后，下次导入会再次显示本说明。
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

        <div className="memory-dialog__actions mt-6 flex justify-end gap-3">
          <button
            className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <AsyncButton
            className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
            isPending={isPending}
            onClick={onAccept}
            pendingLabel="正在保存选择…"
            type="button"
          >
            同意并继续
          </AsyncButton>
        </div>
      </div>
    </ModalDialog>
  );
}
