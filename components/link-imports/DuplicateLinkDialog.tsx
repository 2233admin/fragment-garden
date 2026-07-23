"use client";

import { useId } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

type DuplicateLinkDialogProps = {
  errorMessage: string | null;
  existingTitle: string;
  isOpen: boolean;
  isPending: boolean;
  onCancel: () => void;
  onCreateDuplicate: () => void;
  onOpenExisting: (triggerElement: HTMLButtonElement) => void;
};

export function DuplicateLinkDialog({
  errorMessage,
  existingTitle,
  isOpen,
  isPending,
  onCancel,
  onCreateDuplicate,
  onOpenExisting,
}: DuplicateLinkDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
    >
      <div className="p-6 sm:p-7">
        <p className="text-xs font-semibold tracking-[0.16em] text-garden-accent uppercase">
          已有内容
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
          这个链接已经种过了
        </h2>
        <p className="mt-3 text-sm leading-6 text-garden-muted" id={descriptionId}>
          已有碎片“{existingTitle}”。你可以打开它，也可以明确选择再种一株。
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
            className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-full border border-garden-accent px-5 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={(event) => onOpenExisting(event.currentTarget)}
            type="button"
          >
            打开已有碎片
          </button>
          <AsyncButton
            className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
            isPending={isPending}
            onClick={onCreateDuplicate}
            pendingLabel="正在种下…"
            type="button"
          >
            再种一株
          </AsyncButton>
        </div>
      </div>
    </ModalDialog>
  );
}
