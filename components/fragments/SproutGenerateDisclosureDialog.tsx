"use client";

import { useId } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

type SproutGenerateDisclosureDialogProps = Readonly<{
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  onAccept: () => void;
  onCancel: () => void;
}>;

export function SproutGenerateDisclosureDialog({
  errorMessage,
  isOpen,
  isPending,
  onAccept,
  onCancel,
}: SproutGenerateDisclosureDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,36rem)] rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
    >
      <div className="p-6 sm:p-7">
        <p className="text-xs font-semibold text-garden-accent">思维发芽数据说明</p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
          生成新笔记前，请先确认
        </h2>
        <p className="mt-5 text-sm leading-7 text-garden-ink" id={descriptionId}>
          当前笔记的标题、正文和你追加的笔记会通过 OpenAI
          服务生成一篇新的笔记。不会发送花园中的其他碎片、伙伴建议、原始图片或原始音频。请不要提交不希望由第三方处理的私密信息。
        </p>

        {errorMessage !== null ? (
          <p
            aria-live="assertive"
            className="mt-4 rounded-md bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="rounded-md border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            暂不使用 AI
          </button>
          <AsyncButton
            className="rounded-md bg-garden-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
            isPending={isPending}
            onClick={onAccept}
            pendingLabel="正在保存选择…"
            type="button"
          >
            同意并生成
          </AsyncButton>
        </div>
      </div>
    </ModalDialog>
  );
}
