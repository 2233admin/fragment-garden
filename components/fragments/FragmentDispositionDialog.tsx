"use client";

import { useId } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

export type FragmentDispositionPendingAction = "archive" | "delete" | null;

type FragmentDispositionDialogProps = {
  errorMessage: string | null;
  isOpen: boolean;
  onArchive: () => void;
  onCancel: () => void;
  onDelete: () => void;
  pendingAction: FragmentDispositionPendingAction;
};

export function FragmentDispositionDialog({
  errorMessage,
  isOpen,
  onArchive,
  onCancel,
  onDelete,
  pendingAction,
}: FragmentDispositionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const isPending = pendingAction !== null;

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={onCancel}
      role="alertdialog"
    >
      <div className="p-6 sm:p-7">
        <p className="text-xs font-semibold tracking-[0.18em] text-garden-danger uppercase">
          选择如何处理
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
          这条碎片不再需要了吗？
        </h2>
        <div className="mt-3 space-y-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
          <p>封存后，它会离开主要花园，但仍可在“已封存”中找到并恢复。</p>
          <p>删除后，它会从默认列表和花园移除；第一版仍会保留软删除记录。</p>
        </div>

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
            className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <AsyncButton
            className="rounded-full border border-garden-accent px-5 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-60"
            disabled={isPending}
            isPending={pendingAction === "archive"}
            onClick={onArchive}
            pendingLabel="正在封存…"
            type="button"
          >
            封存
          </AsyncButton>
          <AsyncButton
            className="rounded-full bg-garden-danger px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
            disabled={isPending}
            isPending={pendingAction === "delete"}
            onClick={onDelete}
            pendingLabel="正在删除…"
            type="button"
          >
            删除
          </AsyncButton>
        </div>
      </div>
    </ModalDialog>
  );
}
