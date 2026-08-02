"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { StarmapProcessingVisual } from "./StarmapProcessingVisual";

export type ProcessingSaveTransitionGeometry = Readonly<{
  dialogHeight: number;
  dialogWidth: number;
  sourceHeight: number;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
  targetClientX: number | null;
  targetClientY: number | null;
  targetX: number | null;
  targetY: number | null;
}>;

export type ProcessingSaveTransitionOutcome =
  | Readonly<{ status: "pending" }>
  | Readonly<{
      fragmentId: string;
      status: "completed";
    }>
  | Readonly<{
      message: string;
      status: "failed";
    }>;

type StarmapProcessingSaveTransitionProps = Readonly<{
  geometry: ProcessingSaveTransitionGeometry;
  isReducedMotion: boolean;
  jobId: string;
  kind: "image" | "link";
  onComplete: (fragmentId: string) => void;
  onContinueInBackground: () => void;
  onOpenTasks: () => void;
  outcome: ProcessingSaveTransitionOutcome;
}>;

type ProcessingTransitionPhase = "failed" | "morphing" | "processing" | "star";

const MORPH_DURATION_MS = 620;
const STAR_DURATION_MS = 860;
const REDUCED_STAR_DURATION_MS = 720;

type ProcessingTransitionStyle = CSSProperties &
  Readonly<{
    "--processing-dialog-height": string;
    "--processing-dialog-width": string;
    "--processing-source-height": string;
    "--processing-source-left": string;
    "--processing-source-top": string;
    "--processing-source-width": string;
    "--processing-target-x": string;
    "--processing-target-y": string;
  }>;

function transitionStyle(geometry: ProcessingSaveTransitionGeometry): ProcessingTransitionStyle {
  const fallbackTargetX = geometry.dialogWidth / 2;
  const fallbackTargetY = geometry.dialogHeight / 2;

  return {
    "--processing-dialog-height": `${geometry.dialogHeight}px`,
    "--processing-dialog-width": `${geometry.dialogWidth}px`,
    "--processing-source-height": `${geometry.sourceHeight}px`,
    "--processing-source-left": `${geometry.sourceLeft}px`,
    "--processing-source-top": `${geometry.sourceTop}px`,
    "--processing-source-width": `${geometry.sourceWidth}px`,
    "--processing-target-x": `${geometry.targetX ?? fallbackTargetX}px`,
    "--processing-target-y": `${geometry.targetY ?? fallbackTargetY}px`,
  };
}

export function StarmapProcessingSaveTransition({
  geometry,
  isReducedMotion,
  jobId,
  kind,
  onComplete,
  onContinueInBackground,
  onOpenTasks,
  outcome,
}: StarmapProcessingSaveTransitionProps) {
  const onCompleteRef = useRef(onComplete);
  const transitionRef = useRef<HTMLDivElement>(null);
  const [hasMorphed, setHasMorphed] = useState(isReducedMotion);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (isReducedMotion) return;
    const timer = window.setTimeout(() => setHasMorphed(true), MORPH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [isReducedMotion]);

  useEffect(() => {
    transitionRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const transition = transitionRef.current;
    if (transition === null || geometry.targetClientX === null || geometry.targetClientY === null) {
      return;
    }

    const bounds = transition.getBoundingClientRect();
    transition.style.setProperty(
      "--processing-target-x",
      `${geometry.targetClientX - bounds.left}px`,
    );
    transition.style.setProperty(
      "--processing-target-y",
      `${geometry.targetClientY - bounds.top}px`,
    );
  }, [geometry.targetClientX, geometry.targetClientY]);

  const hasResolvedTarget =
    outcome.status !== "completed" ||
    (geometry.targetX !== null &&
      geometry.targetY !== null &&
      Number.isFinite(geometry.targetX) &&
      Number.isFinite(geometry.targetY));

  const phase: ProcessingTransitionPhase = !hasMorphed
    ? "morphing"
    : outcome.status === "completed" && hasResolvedTarget
      ? "star"
      : outcome.status === "failed"
        ? "failed"
        : "processing";

  const completedFragmentId = outcome.status === "completed" ? outcome.fragmentId : null;

  useEffect(() => {
    if (phase !== "star" || completedFragmentId === null) return;
    const timer = window.setTimeout(
      () => onCompleteRef.current(completedFragmentId),
      isReducedMotion ? REDUCED_STAR_DURATION_MS : STAR_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [completedFragmentId, isReducedMotion, phase]);

  const processingLabel = kind === "link" ? "正在读取这段链接" : "正在理解这张图片";
  const liveMessage =
    phase === "failed"
      ? "这次整理没有完成，任务仍然保存在本地。"
      : phase === "star"
        ? "内容已经整理完成，并落进星空。"
        : processingLabel;

  return (
    <div
      aria-label="内容整理状态"
      className="memory-record-processing-transition"
      data-processing-kind={kind}
      data-processing-phase={phase}
      data-reduced-motion={isReducedMotion || undefined}
      data-star-fragment-id={outcome.status === "completed" ? outcome.fragmentId : undefined}
      data-target-client-x={geometry.targetClientX?.toFixed(2)}
      data-target-client-y={geometry.targetClientY?.toFixed(2)}
      data-testid="record-processing-morph"
      data-transition-job-id={jobId}
      ref={transitionRef}
      style={transitionStyle(geometry)}
      tabIndex={-1}
    >
      <p
        aria-atomic="true"
        aria-live={phase === "failed" ? "assertive" : "polite"}
        className="sr-only"
        role={phase === "failed" ? "alert" : "status"}
      >
        {liveMessage}
      </p>
      <div aria-hidden="true" className="memory-record-processing-transition__visual">
        <span className="memory-record-processing-transition__button-shell">开始整理</span>
        <StarmapProcessingVisual
          className="memory-record-processing-transition__shared-visual"
          state={phase === "failed" ? "failed" : "active"}
        />
      </div>

      <div className="memory-record-processing-transition__copy">
        {phase === "failed" && outcome.status === "failed" ? (
          <>
            <strong>这次整理没有完成</strong>
            <span>{outcome.message}</span>
            <div className="memory-record-processing-transition__actions">
              <button onClick={onContinueInBackground} type="button">
                稍后再试
              </button>
              <button onClick={onOpenTasks} type="button">
                查看任务
              </button>
            </div>
          </>
        ) : phase === "star" ? (
          <>
            <strong>内容已经落进星空</strong>
            <span>这颗星现在就是刚刚保存的真实记录。</span>
          </>
        ) : (
          <>
            <strong>{processingLabel}</strong>
            <span>完成后，它会在真实位置亮成一颗记忆星。</span>
            {phase === "processing" ? (
              <button
                className="memory-record-processing-transition__background-action"
                onClick={onContinueInBackground}
                type="button"
              >
                转入后台
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
