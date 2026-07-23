"use client";

import { useId } from "react";

import { AsyncButton } from "./AsyncButton";
import { ModalDialog } from "./ModalDialog";

type ConfirmDialogProps = {
  confirmLabel: string;
  description: string;
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  pendingLabel: string;
  title: string;
};

export function ConfirmDialog({
  confirmLabel,
  description,
  errorMessage,
  isOpen,
  isPending,
  onCancel,
  onConfirm,
  pendingLabel,
  title,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
      role="alertdialog"
    >
      <div className="p-6 sm:p-7">
        <p className="text-xs font-semibold tracking-[0.18em] text-garden-danger uppercase">
          需要确认
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold" id={titleId}>
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-garden-muted" id={descriptionId}>
          {description}
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

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <AsyncButton
            className="rounded-full bg-garden-danger px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
            isPending={isPending}
            onClick={onConfirm}
            pendingLabel={pendingLabel}
            type="button"
          >
            {confirmLabel}
          </AsyncButton>
        </div>
      </div>
    </ModalDialog>
  );
}
