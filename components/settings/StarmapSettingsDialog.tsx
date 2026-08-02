"use client";

import { ChevronRight, DatabaseBackup, Sparkles } from "lucide-react";
import { useId } from "react";

import { ModalDialog } from "../shared/ModalDialog";

type StarmapSettingsDialogProps = Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onOpenBackup: () => void;
}>;

export function StarmapSettingsDialog({
  isOpen,
  onClose,
  onOpenBackup,
}: StarmapSettingsDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <ModalDialog
      appearance="starmap"
      className="m-auto w-[min(92vw,30rem)] overflow-hidden rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      labelledBy={titleId}
      onRequestClose={onClose}
    >
      <header className="memory-dialog__header border-b border-garden-line px-6 py-5 sm:px-7">
        <h2 className="font-display text-2xl font-semibold" id={titleId}>
          设置
        </h2>
        <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
          管理本地档案与星空体验。
        </p>
      </header>

      <div className="px-6 sm:px-7">
        <button
          className="flex w-full items-center gap-4 border-b border-garden-line py-5 text-left hover:bg-garden-soft focus-visible:z-10"
          onClick={onOpenBackup}
          type="button"
        >
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-garden-line bg-garden-soft text-garden-accent"
          >
            <DatabaseBackup size={19} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-garden-ink">数据备份</span>
            <span className="mt-1 block text-xs leading-5 text-garden-muted">
              导出或恢复当前浏览器中的星空档案
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="shrink-0 text-garden-muted"
            size={18}
            strokeWidth={1.8}
          />
        </button>

        <button className="flex w-full items-center gap-4 py-5 text-left" disabled type="button">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-garden-line bg-garden-soft text-garden-muted"
          >
            <Sparkles size={19} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-garden-ink">动效</span>
            <span className="mt-1 block text-xs leading-5 text-garden-muted">
              星空运动与界面过渡
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-garden-muted">暂未开放</span>
        </button>
      </div>

      <footer className="memory-dialog__footer flex justify-end border-t border-garden-line px-6 py-4 sm:px-7">
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
