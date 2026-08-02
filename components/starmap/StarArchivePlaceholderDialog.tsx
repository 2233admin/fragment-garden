"use client";

import { Archive } from "lucide-react";
import { useId } from "react";

import { ModalDialog } from "../shared/ModalDialog";

type StarArchivePlaceholderDialogProps = Readonly<{
  isOpen: boolean;
  onClose: () => void;
}>;

export function StarArchivePlaceholderDialog({
  isOpen,
  onClose,
}: StarArchivePlaceholderDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      appearance="starmap"
      className="m-auto w-[min(92vw,26rem)] overflow-hidden rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      labelledBy={titleId}
      onRequestClose={onClose}
    >
      <header className="memory-dialog__header border-b border-garden-line px-6 py-5">
        <h2 className="font-display text-2xl font-semibold" id={titleId}>
          星星仓库
        </h2>
      </header>

      <div className="grid min-h-44 place-items-center px-6 py-9 text-center">
        <div>
          <Archive
            aria-hidden="true"
            className="mx-auto text-garden-accent"
            size={28}
            strokeWidth={1.6}
          />
          <p className="mt-4 text-sm font-semibold text-garden-ink" id={descriptionId}>
            暂未开放
          </p>
        </div>
      </div>

      <footer className="memory-dialog__footer flex justify-end border-t border-garden-line px-6 py-4">
        <button
          className="rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold hover:bg-garden-soft"
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </footer>
    </ModalDialog>
  );
}
