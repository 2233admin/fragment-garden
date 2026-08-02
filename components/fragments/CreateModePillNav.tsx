"use client";

import { useRef, type KeyboardEvent } from "react";

export type StarmapCreateMode = "text" | "link" | "image";

type CreateModePillNavProps = Readonly<{
  activeMode: StarmapCreateMode;
  busyMode: StarmapCreateMode | null;
  isDisabled: boolean;
  onChange: (mode: StarmapCreateMode) => void;
}>;

const ITEMS: readonly Readonly<{ label: string; mode: StarmapCreateMode }>[] = [
  { label: "文字", mode: "text" },
  { label: "链接", mode: "link" },
  { label: "图片", mode: "image" },
];

export function CreateModePillNav({
  activeMode,
  busyMode,
  isDisabled,
  onChange,
}: CreateModePillNavProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number): void {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % ITEMS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + ITEMS.length) % ITEMS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = ITEMS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextItem = ITEMS[nextIndex];
    if (nextItem === undefined) return;
    onChange(nextItem.mode);
    itemRefs.current[nextIndex]?.focus();
  }

  return (
    <div aria-label="记录类型" className="memory-create-pill-nav" role="group">
      {ITEMS.map((item, index) => {
        const isActive = item.mode === activeMode;
        const label = busyMode === item.mode ? "正在准备…" : item.label;
        return (
          <button
            aria-busy={busyMode === item.mode || undefined}
            aria-pressed={isActive}
            className="memory-create-pill-nav__item"
            data-active={isActive || undefined}
            disabled={isDisabled}
            key={item.mode}
            onClick={() => onChange(item.mode)}
            onKeyDown={(event) => moveSelection(event, index)}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            <span aria-hidden="true" className="memory-create-pill-nav__fill" />
            <span className="memory-create-pill-nav__labels">
              <span>{label}</span>
              <span aria-hidden="true">{label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
