"use client";

import type { Ref } from "react";

export type GardenMode = "garden" | "cards";

type GardenModeToggleProps = {
  cardButtonRef?: Ref<HTMLButtonElement>;
  gardenButtonRef?: Ref<HTMLButtonElement>;
  mode: GardenMode;
  onModeChange: (mode: GardenMode) => void;
};

const MODE_LABELS: Readonly<Record<GardenMode, string>> = {
  garden: "花园模式",
  cards: "卡片模式",
};

export function GardenModeToggle({
  cardButtonRef,
  gardenButtonRef,
  mode,
  onModeChange,
}: GardenModeToggleProps) {
  return (
    <div>
      <nav
        aria-label="浏览模式"
        className="inline-flex rounded-xl border border-[#a98b63] bg-[#f4ead3] p-1 shadow-sm"
      >
        {(["garden", "cards"] as const).map((candidateMode) => (
          <button
            aria-controls={`${candidateMode}-mode-panel`}
            aria-pressed={mode === candidateMode}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[#665b47] hover:text-garden-ink aria-pressed:bg-[#426f4d] aria-pressed:text-white"
            key={candidateMode}
            onClick={() => onModeChange(candidateMode)}
            ref={candidateMode === "garden" ? gardenButtonRef : cardButtonRef}
            type="button"
          >
            {MODE_LABELS[candidateMode]}
          </button>
        ))}
      </nav>
      <p aria-live="polite" className="sr-only">
        当前模式：{MODE_LABELS[mode]}
      </p>
    </div>
  );
}
