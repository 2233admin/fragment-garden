"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { deriveStarPosition, type StarMapSnapshot } from "@/domain";
import type {
  ContentStarScreenPosition,
  MemoryStarmapRuntime,
} from "@/starmap/runtime/memory-starmap-runtime";

type MemoryStarmapCanvasProps = Readonly<{
  onClearSelection: () => void;
  selectedFragmentId: string | null;
  snapshot: StarMapSnapshot;
  onSelectStar: (fragmentId: string, triggerElement: HTMLButtonElement | null) => void;
}>;

type RuntimeState = "loading" | "ready" | "error";

type HoverState = Readonly<{
  fragmentId: string;
  title: string;
  left: number;
  top: number;
}>;

export type MemoryStarmapCanvasHandle = Readonly<{
  getStarScreenPosition: (fragmentId: string) => ContentStarScreenPosition | null;
  setStarLaunchActive: (fragmentId: string | null) => void;
}>;

export const MemoryStarmapCanvas = forwardRef<MemoryStarmapCanvasHandle, MemoryStarmapCanvasProps>(
  function MemoryStarmapCanvas(
    { onClearSelection, selectedFragmentId, snapshot, onSelectStar },
    forwardedRef,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const runtimeRef = useRef<MemoryStarmapRuntime | null>(null);
    const latestSnapshotRef = useRef(snapshot);
    const latestSelectedFragmentIdRef = useRef(selectedFragmentId);
    const latestReducedMotionRef = useRef(true);
    const latestStarLaunchIdRef = useRef<string | null>(null);
    const onClearSelectionRef = useRef(onClearSelection);
    const onSelectStarRef = useRef(onSelectStar);
    const [runtimeState, setRuntimeState] = useState<RuntimeState>("loading");
    const [hoverState, setHoverState] = useState<HoverState | null>(null);
    const [isReducedMotion, setIsReducedMotion] = useState(true);

    useImperativeHandle(
      forwardedRef,
      () => ({
        getStarScreenPosition(fragmentId: string): ContentStarScreenPosition | null {
          return (
            runtimeRef.current?.getStarScreenPosition(fragmentId, deriveStarPosition(fragmentId)) ??
            null
          );
        },
        setStarLaunchActive(fragmentId: string | null): void {
          latestStarLaunchIdRef.current = fragmentId;
          runtimeRef.current?.setStarLaunchActive(
            fragmentId,
            fragmentId === null ? null : deriveStarPosition(fragmentId),
          );
        },
      }),
      [],
    );

    useEffect(() => {
      latestSnapshotRef.current = snapshot;
    }, [snapshot]);

    useEffect(() => {
      onClearSelectionRef.current = onClearSelection;
    }, [onClearSelection]);

    useEffect(() => {
      onSelectStarRef.current = onSelectStar;
    }, [onSelectStar]);

    useEffect(() => {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      const updatePreference = (): void => {
        latestReducedMotionRef.current = mediaQuery.matches;
        setIsReducedMotion(mediaQuery.matches);
      };
      updatePreference();
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }, []);

    useEffect(() => {
      const host = hostRef.current;
      if (host === null) return;
      let isCancelled = false;
      setRuntimeState("loading");
      host.replaceChildren();

      void import("@/starmap/runtime/memory-starmap-runtime")
        .then(({ createMemoryStarmapRuntime }) => {
          if (isCancelled) return;
          const currentSnapshot = latestSnapshotRef.current;
          const runtime = createMemoryStarmapRuntime({
            host,
            initialRotationSpeed: currentSnapshot.rotationSpeedRadiansPerSecond,
            initialStars: currentSnapshot.stars,
            isReducedMotion: latestReducedMotionRef.current,
            onBackgroundSelected: () => onClearSelectionRef.current(),
            onRuntimeError: () => {
              if (!isCancelled) {
                setHoverState(null);
                setRuntimeState("error");
              }
            },
            onStarHover: (target) => {
              if (target === null) {
                setHoverState(null);
                return;
              }
              const bounds = host.getBoundingClientRect();
              setHoverState({
                fragmentId: target.fragmentId,
                title: target.title,
                left: Math.min(bounds.width - 220, Math.max(8, target.clientX - bounds.left)),
                top: Math.min(bounds.height - 70, Math.max(8, target.clientY - bounds.top)),
              });
            },
            onStarSelected: (fragmentId) => onSelectStarRef.current(fragmentId, null),
          });
          if (isCancelled) {
            runtime.destroy();
            return;
          }
          runtimeRef.current = runtime;
          runtime.setSelectedStar(latestSelectedFragmentIdRef.current);
          runtime.setDetailOpen(latestSelectedFragmentIdRef.current !== null);
          runtime.setStarLaunchActive(
            latestStarLaunchIdRef.current,
            latestStarLaunchIdRef.current === null
              ? null
              : deriveStarPosition(latestStarLaunchIdRef.current),
          );
          setRuntimeState("ready");
        })
        .catch(() => {
          if (!isCancelled) setRuntimeState("error");
        });

      return () => {
        isCancelled = true;
        setHoverState(null);
        runtimeRef.current?.destroy();
        runtimeRef.current = null;
        host.replaceChildren();
      };
    }, []);

    useEffect(() => {
      runtimeRef.current?.setStars(snapshot.stars);
      runtimeRef.current?.setRotationSpeed(snapshot.rotationSpeedRadiansPerSecond);
    }, [snapshot]);

    useEffect(() => {
      runtimeRef.current?.setReducedMotion(isReducedMotion);
    }, [isReducedMotion]);

    useEffect(() => {
      latestSelectedFragmentIdRef.current = selectedFragmentId;
      runtimeRef.current?.setSelectedStar(selectedFragmentId);
      runtimeRef.current?.setDetailOpen(selectedFragmentId !== null);
    }, [selectedFragmentId]);

    return (
      <div className="memory-starmap-canvas" data-runtime-state={runtimeState}>
        <div className="memory-starmap-host" data-testid="memory-starmap-host" ref={hostRef} />

        {runtimeState === "loading" ? (
          <div aria-live="polite" className="memory-starmap-loading" role="status">
            <span aria-hidden="true" className="memory-starmap-loading-star" />
            <span>正在唤醒星空…</span>
          </div>
        ) : null}

        {runtimeState === "error" ? (
          <div className="memory-starmap-fallback" role="alert">
            <p className="memory-starmap-fallback-title">星空暂时无法显示</p>
            <p>你的笔记仍安全保存在当前浏览器中，可以从下面的星星列表继续打开。</p>
          </div>
        ) : null}

        {hoverState !== null && runtimeState === "ready" ? (
          <div
            className="memory-starmap-tooltip"
            style={{ left: hoverState.left, top: hoverState.top }}
          >
            {hoverState.title}
          </div>
        ) : null}

        <details
          className="memory-starmap-access-list"
          open={runtimeState === "error" || undefined}
        >
          <summary>星星列表</summary>
          <div className="memory-starmap-access-list-panel">
            {snapshot.stars.length === 0 ? (
              <p>这里还没有被点亮的记录。</p>
            ) : (
              <ul>
                {snapshot.stars.map((star) => (
                  <li key={star.fragmentId}>
                    <button
                      data-memory-star-trigger="true"
                      data-selected={selectedFragmentId === star.fragmentId || undefined}
                      onClick={(event) => onSelectStar(star.fragmentId, event.currentTarget)}
                      type="button"
                    >
                      <span aria-hidden="true" className="memory-starmap-list-star" />
                      <span>{star.title}</span>
                      <small>
                        {star.userNoteCount > 0 ? `追加 ${star.userNoteCount}` : "初次点亮"}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>
    );
  },
);
