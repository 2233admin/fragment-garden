"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type TextSaveTransitionGeometry = Readonly<{
  dialogHeight: number;
  dialogLeft: number;
  dialogTop: number;
  dialogWidth: number;
  sourceHeight: number;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
  targetClientX: number;
  targetClientY: number;
  targetX: number;
  targetY: number;
}>;

type SaveTransitionPhase = "expand" | "star" | "reduced";

type StarmapTextSaveTransitionProps = Readonly<{
  fragmentId: string;
  geometry: TextSaveTransitionGeometry;
  isReducedMotion: boolean;
  onComplete: () => void;
}>;

const EXPAND_DURATION_MS = 560;
const FULL_TRANSITION_DURATION_MS = 1_360;
const REDUCED_TRANSITION_DURATION_MS = 420;

type TransitionStyle = CSSProperties &
  Readonly<{
    "--record-dialog-height": string;
    "--record-dialog-left": string;
    "--record-dialog-top": string;
    "--record-dialog-width": string;
    "--record-source-height": string;
    "--record-source-left": string;
    "--record-source-top": string;
    "--record-source-width": string;
    "--record-target-x": string;
    "--record-target-y": string;
  }>;

function transitionStyle(geometry: TextSaveTransitionGeometry): TransitionStyle {
  return {
    "--record-dialog-height": `${geometry.dialogHeight}px`,
    "--record-dialog-left": `${geometry.dialogLeft}px`,
    "--record-dialog-top": `${geometry.dialogTop}px`,
    "--record-dialog-width": `${geometry.dialogWidth}px`,
    "--record-source-height": `${geometry.sourceHeight}px`,
    "--record-source-left": `${geometry.sourceLeft}px`,
    "--record-source-top": `${geometry.sourceTop}px`,
    "--record-source-width": `${geometry.sourceWidth}px`,
    "--record-target-x": `${geometry.targetX}px`,
    "--record-target-y": `${geometry.targetY}px`,
  };
}

export function StarmapTextSaveTransition({
  fragmentId,
  geometry,
  isReducedMotion,
  onComplete,
}: StarmapTextSaveTransitionProps) {
  const onCompleteRef = useRef(onComplete);
  const [phase, setPhase] = useState<SaveTransitionPhase>(isReducedMotion ? "reduced" : "expand");

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (isReducedMotion) {
      const completionTimer = window.setTimeout(
        () => onCompleteRef.current(),
        REDUCED_TRANSITION_DURATION_MS,
      );
      return () => window.clearTimeout(completionTimer);
    }

    const phaseTimer = window.setTimeout(() => setPhase("star"), EXPAND_DURATION_MS);
    return () => window.clearTimeout(phaseTimer);
  }, [isReducedMotion]);

  useEffect(() => {
    if (phase !== "star") return;

    const completionTimer = window.setTimeout(
      () => onCompleteRef.current(),
      FULL_TRANSITION_DURATION_MS - EXPAND_DURATION_MS,
    );
    return () => window.clearTimeout(completionTimer);
  }, [phase]);

  return (
    <div
      aria-live="polite"
      className={`memory-record-save-transition memory-record-save-transition--${phase}`}
      data-save-phase={phase}
      data-star-fragment-id={fragmentId}
      data-target-client-x={geometry.targetClientX.toFixed(2)}
      data-target-client-y={geometry.targetClientY.toFixed(2)}
      data-testid="record-save-morph"
      role="status"
      style={transitionStyle(geometry)}
    >
      <div aria-hidden="true" className="memory-record-save-transition__morph">
        <span className="memory-record-save-transition__button-label">记录已保存</span>
        <span className="memory-record-save-transition__star-core" />
      </div>
      {isReducedMotion ? (
        <span className="memory-record-save-transition__reduced-label">已点亮一颗星</span>
      ) : null}
      <span className="sr-only">记录已保存，正在点亮一颗星。</span>
    </div>
  );
}
