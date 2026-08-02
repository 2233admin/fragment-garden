"use client";

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { MemoryStarDetailRect } from "./memory-star-detail-layout";

type MemoryStarDetailTransitionProps = Readonly<{
  direction: "expand" | "collapse";
  from: MemoryStarDetailRect;
  onCancel: () => void;
  onComplete: () => void;
  title: string;
  to: MemoryStarDetailRect;
}>;

type TransitionStyle = CSSProperties &
  Readonly<{
    "--memory-detail-from-scale-x": number;
    "--memory-detail-from-scale-y": number;
    "--memory-detail-from-x": string;
    "--memory-detail-from-y": string;
  }>;

const TRANSITION_FALLBACK_MS = 420;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function MemoryStarDetailTransition({
  direction,
  from,
  onCancel,
  onComplete,
  title,
  to,
}: MemoryStarDetailTransitionProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    let animationFrame = 0;
    const finishWithoutMotion = (): void => {
      animationFrame = window.requestAnimationFrame(onComplete);
    };
    const handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
      if (event.matches) finishWithoutMotion();
    };

    if (mediaQuery.matches) finishWithoutMotion();
    layerRef.current?.focus();
    const timeoutId = window.setTimeout(onComplete, TRANSITION_FALLBACK_MS);
    mediaQuery.addEventListener("change", handleMotionPreferenceChange);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeoutId);
      mediaQuery.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, [onComplete]);

  function keepTransitionFocus(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  const style: TransitionStyle = {
    "--memory-detail-from-scale-x": from.width / Math.max(1, to.width),
    "--memory-detail-from-scale-y": from.height / Math.max(1, to.height),
    "--memory-detail-from-x": `${from.left - to.left}px`,
    "--memory-detail-from-y": `${from.top - to.top}px`,
    height: to.height,
    left: to.left,
    top: to.top,
    width: to.width,
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-label={`${direction === "expand" ? "正在展开" : "正在收起"}${title}`}
      aria-modal="true"
      className="memory-star-detail-transition-layer"
      data-direction={direction}
      onKeyDown={keepTransitionFocus}
      ref={layerRef}
      role="dialog"
      tabIndex={-1}
    >
      <div aria-hidden="true">
        <div className="memory-star-detail-transition-backdrop" />
        <div
          className="memory-star-detail-surface memory-star-detail-transition-surface"
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) onComplete();
          }}
          style={style}
        >
          <span>{title}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
