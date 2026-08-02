"use client";

import { useId } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

type SproutDisclosureDialogProps = {
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onUseLocal: () => void;
};

export function SproutDisclosureDialog({
  errorMessage,
  isOpen,
  isPending,
  onAccept,
  onCancel,
  onUseLocal,
}: SproutDisclosureDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,36rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
    >
      <div className="p-6 sm:p-7">
        <p className="text-xs font-semibold tracking-[0.16em] text-garden-accent uppercase">
          思维发芽数据说明
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
          使用 AI 前，请先确认
        </h2>
        <p className="mt-5 text-sm leading-7 text-garden-ink" id={descriptionId}>
          让伙伴帮想法发芽时，当前碎片的标题、正文、补充内容和已经读取到的链接内容会通过 OpenAI
          服务生成建议。不会发送花园中的其他碎片。请不要提交不希望由第三方处理的私密信息。
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
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-full border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onUseLocal}
            type="button"
          >
            暂不使用 AI
          </button>
          <AsyncButton
            className="rounded-full bg-garden-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
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
