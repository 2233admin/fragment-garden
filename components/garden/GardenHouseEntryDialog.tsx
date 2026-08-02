"use client";

import { ModalDialog } from "@/components/shared/ModalDialog";

export type HouseEntryState = "closed" | "confirming" | "waiting" | "transitioning";

type GardenHouseEntryDialogProps = {
  entryState: HouseEntryState;
  onCancel: () => void;
  onConfirm: () => void;
};

export function GardenHouseEntryDialog({
  entryState,
  onCancel,
  onConfirm,
}: GardenHouseEntryDialogProps) {
  const isOpen = entryState !== "closed";
  const isPending = entryState === "waiting" || entryState === "transitioning";

  return (
    <ModalDialog
      className="garden-pixel-dialog m-auto w-[min(92vw,29rem)] border-0 bg-transparent p-0"
      describedBy="garden-house-entry-description"
      isOpen={isOpen}
      isPending={isPending}
      labelledBy="garden-house-entry-title"
      onRequestClose={onCancel}
      role={isPending ? "dialog" : "alertdialog"}
    >
      <div className="garden-pixel-dialog__panel text-center">
        {entryState === "confirming" ? (
          <>
            <p className="garden-pixel-dialog__eyebrow">花园小屋</p>
            <h2
              className="mt-2 font-display text-2xl font-semibold text-[#402d20]"
              id="garden-house-entry-title"
            >
              要进入小屋整理笔记吗？
            </h2>
            <p
              className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#725b42]"
              id="garden-house-entry-description"
            >
              小屋里保存着所有卡片。进入后可以继续记录、编辑和回看内容。
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                className="garden-pixel-button garden-pixel-button--quiet"
                onClick={onCancel}
                type="button"
              >
                留在花园
              </button>
              <button
                autoFocus
                className="garden-pixel-button garden-pixel-button--primary"
                onClick={onConfirm}
                type="button"
              >
                确认进入
              </button>
            </div>
          </>
        ) : (
          <div aria-atomic="true" aria-live="polite" className="py-3">
            <div aria-hidden="true" className="garden-pixel-loader mx-auto">
              <span />
              <span />
              <span />
            </div>
            <p className="garden-pixel-dialog__eyebrow mt-5">花园小屋</p>
            <h2
              className="mt-2 font-display text-2xl font-semibold text-[#402d20]"
              id="garden-house-entry-title"
            >
              {entryState === "waiting" ? "正在进入小屋……" : "木门已经打开……"}
            </h2>
            <p
              className="mt-3 text-sm font-medium text-[#725b42]"
              id="garden-house-entry-description"
            >
              {entryState === "waiting" ? "稍等片刻，正在整理庭院记录。" : "马上带你前往卡片模式。"}
            </p>
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
