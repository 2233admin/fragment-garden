"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  getMemoryStarDetailViewModel,
  type MemoryStarDetailViewModel,
} from "@/data/queries/memory-star-detail-query";

import { MemoryStarCompactCard, type MemoryStarDetailStatus } from "./MemoryStarCompactCard";
import { MemoryStarDetailTransition } from "./MemoryStarDetailTransition";
import { MemoryStarExpandedCard } from "./MemoryStarExpandedCard";
import {
  resolveCompactDetailLayout,
  resolveExpandedDetailRect,
  toMemoryStarDetailRect,
  type MemoryStarCompactLayout,
  type MemoryStarDetailAnchor,
  type MemoryStarDetailRect,
  type MemoryStarDetailViewport,
} from "./memory-star-detail-layout";

export type { MemoryStarDetailAnchor } from "./memory-star-detail-layout";

type MemoryStarDetailPanelProps = Readonly<{
  anchor: MemoryStarDetailAnchor | null;
  fragmentId: string;
  onClose: () => void;
  resolveAnchor: (fragmentId: string) => MemoryStarDetailAnchor | null;
}>;

type DetailQueryState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "ready"; detail: MemoryStarDetailViewModel }>;

type DetailLayout = Readonly<{
  compact: MemoryStarCompactLayout;
  expanded: MemoryStarDetailRect;
}>;

type DetailPresentation =
  | Readonly<{ phase: "compact"; shouldSkipEnterAnimation: boolean }>
  | Readonly<{ phase: "expanded"; shouldSkipEnterAnimation: boolean }>
  | Readonly<{
      direction: "expand" | "collapse";
      from: MemoryStarDetailRect;
      phase: "transition";
      to: MemoryStarDetailRect;
      token: number;
    }>;

const LOADING_DETAIL_STATE: DetailQueryState = { status: "loading" };
const FALLBACK_VIEWPORT: MemoryStarDetailViewport = { height: 800, width: 1280 };
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readViewport(): MemoryStarDetailViewport {
  if (typeof window === "undefined") return FALLBACK_VIEWPORT;
  return { height: window.innerHeight, width: window.innerWidth };
}

function resolveDetailLayout(anchor: MemoryStarDetailAnchor | null): DetailLayout {
  const viewport = readViewport();
  return {
    compact: resolveCompactDetailLayout(anchor, viewport),
    expanded: resolveExpandedDetailRect(viewport),
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function toDetailStatus(state: DetailQueryState): MemoryStarDetailStatus {
  return state.status;
}

function MemoryStarDetailPanelContent({
  anchor,
  fragmentId,
  onClose,
  resolveAnchor,
}: MemoryStarDetailPanelProps) {
  const compactSurfaceRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const expandedSurfaceRef = useRef<HTMLElement>(null);
  const transitionTokenRef = useRef(0);
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [layout, setLayout] = useState<DetailLayout>(() => resolveDetailLayout(anchor));
  const [presentation, setPresentation] = useState<DetailPresentation>({
    phase: "compact",
    shouldSkipEnterAnimation: false,
  });

  const detailState: DetailQueryState = useLiveQuery(
    async (): Promise<DetailQueryState> => {
      try {
        const detail = await getMemoryStarDetailViewModel(fragmentId);
        return detail === undefined ? { status: "missing" } : { status: "ready", detail };
      } catch {
        return { status: "error" };
      }
    },
    [fragmentId, queryAttempt],
    LOADING_DETAIL_STATE,
  );
  const detail = detailState.status === "ready" ? detailState.detail : null;
  const status = toDetailStatus(detailState);

  const finishTransition = useCallback((token: number): void => {
    setPresentation((current) => {
      if (current.phase !== "transition" || current.token !== token) return current;
      return {
        phase: current.direction === "expand" ? "expanded" : "compact",
        shouldSkipEnterAnimation: true,
      };
    });
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    const updateLayout = (): void => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(() => {
          setLayout(resolveDetailLayout(resolveAnchor(fragmentId) ?? anchor));
          setPresentation((current) => {
            if (current.phase !== "transition") return current;
            return {
              phase: current.direction === "expand" ? "expanded" : "compact",
              shouldSkipEnterAnimation: true,
            };
          });
        });
      });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateLayout);
    };
  }, [anchor, fragmentId, resolveAnchor]);

  useEffect(() => {
    if (presentation.phase !== "compact") return;
    const animationFrame = window.requestAnimationFrame(() => expandButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(animationFrame);
  }, [presentation.phase, status]);

  useEffect(() => {
    if (presentation.phase !== "compact") return;

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || compactSurfaceRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest(".memory-starmap-host") !== null ||
          target.closest('[data-memory-star-trigger="true"]') !== null ||
          target.closest('[data-starmap-overlay-trigger="true"]') !== null)
      ) {
        return;
      }
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, presentation.phase]);

  function expandDetail(): void {
    if (status !== "ready") return;
    if (prefersReducedMotion()) {
      setPresentation({ phase: "expanded", shouldSkipEnterAnimation: true });
      return;
    }
    const source = compactSurfaceRef.current?.getBoundingClientRect();
    if (source === undefined) {
      setPresentation({ phase: "expanded", shouldSkipEnterAnimation: true });
      return;
    }

    transitionTokenRef.current += 1;
    setPresentation({
      direction: "expand",
      from: toMemoryStarDetailRect(source),
      phase: "transition",
      to: layout.expanded,
      token: transitionTokenRef.current,
    });
  }

  function collapseDetail(): void {
    const source = expandedSurfaceRef.current?.getBoundingClientRect();
    const nextLayout = resolveDetailLayout(resolveAnchor(fragmentId) ?? anchor);
    setLayout(nextLayout);
    if (prefersReducedMotion()) {
      setPresentation({ phase: "compact", shouldSkipEnterAnimation: true });
      return;
    }
    if (source === undefined) {
      setPresentation({ phase: "compact", shouldSkipEnterAnimation: true });
      return;
    }

    transitionTokenRef.current += 1;
    setPresentation({
      direction: "collapse",
      from: toMemoryStarDetailRect(source),
      phase: "transition",
      to: nextLayout.compact,
      token: transitionTokenRef.current,
    });
  }

  return (
    <>
      {presentation.phase === "compact" ? (
        <MemoryStarCompactCard
          detail={detail}
          expandButtonRef={expandButtonRef}
          layout={layout.compact}
          onClose={onClose}
          onExpand={expandDetail}
          onRetry={() => setQueryAttempt((attempt) => attempt + 1)}
          ref={compactSurfaceRef}
          shouldSkipEnterAnimation={presentation.shouldSkipEnterAnimation}
          status={status}
        />
      ) : null}

      {presentation.phase === "expanded" ? (
        <MemoryStarExpandedCard
          detail={detail}
          fragmentId={fragmentId}
          layout={layout.expanded}
          onClose={onClose}
          onCollapse={collapseDetail}
          onRetry={() => setQueryAttempt((attempt) => attempt + 1)}
          ref={expandedSurfaceRef}
          shouldSkipEnterAnimation={presentation.shouldSkipEnterAnimation}
          status={status}
        />
      ) : null}

      {presentation.phase === "transition" ? (
        <MemoryStarDetailTransition
          direction={presentation.direction}
          from={presentation.from}
          onCancel={onClose}
          onComplete={() => finishTransition(presentation.token)}
          title={detail?.fragment.title ?? "记忆详情"}
          to={presentation.to}
        />
      ) : null}
    </>
  );
}

export function MemoryStarDetailPanel(props: MemoryStarDetailPanelProps) {
  return <MemoryStarDetailPanelContent {...props} key={props.fragmentId} />;
}
