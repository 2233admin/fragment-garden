"use client";

export type GardenMode = "garden" | "cards";

type GardenModeToggleProps = {
  mode: GardenMode;
  onModeChange: (mode: GardenMode) => void;
};

const MODE_LABELS: Readonly<Record<GardenMode, string>> = {
  garden: "花园模式",
  cards: "卡片模式",
};

export function GardenModeToggle({ mode, onModeChange }: GardenModeToggleProps) {
  return (
    <div>
      <nav
        aria-label="浏览模式"
        className="inline-flex rounded-full border border-garden-line bg-garden-paper p-1 shadow-sm"
      >
        {(["garden", "cards"] as const).map((candidateMode) => (
          <button
            aria-controls={`${candidateMode}-mode-panel`}
            aria-pressed={mode === candidateMode}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-garden-muted hover:text-garden-ink aria-pressed:bg-garden-accent aria-pressed:text-white"
            key={candidateMode}
            onClick={() => onModeChange(candidateMode)}
            type="button"
          >
            {MODE_LABELS[candidateMode]}
          </button>
        ))}
      </nav>
      <p aria-live="polite" className="mt-2 text-center text-xs text-garden-muted">
        当前模式：{MODE_LABELS[mode]}
      </p>
    </div>
  );
}
