"use client";

import { ModalDialog } from "@/components/shared/ModalDialog";

export type GardenReturnState = "closed" | "waiting" | "transitioning";

type GardenReturnTransitionDialogProps = {
  entryState: GardenReturnState;
  onRequestClose: () => void;
};

export function GardenReturnTransitionDialog({
  entryState,
  onRequestClose,
}: GardenReturnTransitionDialogProps) {
  const isOpen = entryState !== "closed";

  return (
    <ModalDialog
      className="garden-pixel-dialog m-auto w-[min(92vw,29rem)] border-0 bg-transparent p-0"
      describedBy="garden-return-description"
      isOpen={isOpen}
      isPending
      labelledBy="garden-return-title"
      onRequestClose={onRequestClose}
    >
      <div className="garden-pixel-dialog__panel text-center">
        <div aria-atomic="true" aria-live="polite" className="py-3">
          <div aria-hidden="true" className="garden-pixel-loader mx-auto">
            <span />
            <span />
            <span />
          </div>
          <p className="garden-pixel-dialog__eyebrow mt-5">返回灵感庭院</p>
          <h2
            className="mt-2 font-display text-2xl font-semibold text-[#402d20]"
            id="garden-return-title"
          >
            {entryState === "waiting" ? "正在走出小屋……" : "庭院已经醒来……"}
          </h2>
          <p className="mt-3 text-sm font-medium text-[#725b42]" id="garden-return-description">
            {entryState === "waiting"
              ? "稍等片刻，正在推开通往花园的木门。"
              : "花草和伙伴都在外面等你。"}
          </p>
        </div>
      </div>
    </ModalDialog>
  );
}
