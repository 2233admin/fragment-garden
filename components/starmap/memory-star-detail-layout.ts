export type MemoryStarDetailAnchor = Readonly<{
  clientX: number;
  clientY: number;
}>;

export type MemoryStarDetailRect = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

export type MemoryStarDetailPlacement = "right" | "left" | "above" | "below" | "fallback";

export type MemoryStarCompactLayout = MemoryStarDetailRect &
  Readonly<{
    isAnchored: boolean;
    placement: MemoryStarDetailPlacement;
  }>;

export type MemoryStarDetailViewport = Readonly<{
  height: number;
  width: number;
}>;

const COMPACT_WIDTH = 328;
const COMPACT_HEIGHT = 184;
const EXPANDED_MAX_WIDTH = 720;
const EXPANDED_MAX_HEIGHT = 688;
const EXPANDED_MIN_HEIGHT = 360;
const VIEWPORT_GAP = 16;
const STAR_GAP = 18;
const TOP_SAFE_AREA = 88;
const BOTTOM_SAFE_AREA = 116;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isUsableAnchor(
  anchor: MemoryStarDetailAnchor | null,
  viewport: MemoryStarDetailViewport,
): anchor is MemoryStarDetailAnchor {
  return (
    anchor !== null &&
    Number.isFinite(anchor.clientX) &&
    Number.isFinite(anchor.clientY) &&
    anchor.clientX >= 0 &&
    anchor.clientX <= viewport.width &&
    anchor.clientY >= 0 &&
    anchor.clientY <= viewport.height
  );
}

export function resolveCompactDetailLayout(
  anchor: MemoryStarDetailAnchor | null,
  viewport: MemoryStarDetailViewport,
): MemoryStarCompactLayout {
  const width = Math.min(COMPACT_WIDTH, Math.max(0, viewport.width - VIEWPORT_GAP * 2));
  const height = Math.min(COMPACT_HEIGHT, Math.max(0, viewport.height - VIEWPORT_GAP * 2));
  const maximumLeft = Math.max(VIEWPORT_GAP, viewport.width - width - VIEWPORT_GAP);
  const maximumTop = Math.max(VIEWPORT_GAP, viewport.height - height - BOTTOM_SAFE_AREA);
  const minimumTop = Math.min(TOP_SAFE_AREA, maximumTop);

  if (!isUsableAnchor(anchor, viewport)) {
    return {
      height,
      isAnchored: false,
      left: clamp((viewport.width - width) / 2, VIEWPORT_GAP, maximumLeft),
      placement: "fallback",
      top: minimumTop,
      width,
    };
  }

  const centeredTop = clamp(anchor.clientY - height / 2, minimumTop, maximumTop);
  const rightLeft = anchor.clientX + STAR_GAP;
  if (rightLeft + width <= viewport.width - VIEWPORT_GAP) {
    return {
      height,
      isAnchored: true,
      left: rightLeft,
      placement: "right",
      top: centeredTop,
      width,
    };
  }

  const leftLeft = anchor.clientX - STAR_GAP - width;
  if (leftLeft >= VIEWPORT_GAP) {
    return {
      height,
      isAnchored: true,
      left: leftLeft,
      placement: "left",
      top: centeredTop,
      width,
    };
  }

  const centeredLeft = clamp(anchor.clientX - width / 2, VIEWPORT_GAP, maximumLeft);
  const aboveTop = anchor.clientY - STAR_GAP - height;
  if (aboveTop >= minimumTop) {
    return {
      height,
      isAnchored: true,
      left: centeredLeft,
      placement: "above",
      top: aboveTop,
      width,
    };
  }

  const belowTop = anchor.clientY + STAR_GAP;
  if (belowTop + height <= viewport.height - BOTTOM_SAFE_AREA) {
    return {
      height,
      isAnchored: true,
      left: centeredLeft,
      placement: "below",
      top: belowTop,
      width,
    };
  }

  return {
    height,
    isAnchored: false,
    left: centeredLeft,
    placement: "fallback",
    top: minimumTop,
    width,
  };
}

export function resolveExpandedDetailRect(
  viewport: MemoryStarDetailViewport,
): MemoryStarDetailRect {
  const width = Math.min(EXPANDED_MAX_WIDTH, Math.max(0, viewport.width - VIEWPORT_GAP * 2));
  const availableHeight = Math.max(0, viewport.height - VIEWPORT_GAP * 2);
  const preferredHeight = Math.max(EXPANDED_MIN_HEIGHT, viewport.height * 0.78);
  const height = Math.min(EXPANDED_MAX_HEIGHT, availableHeight, preferredHeight);

  return {
    height,
    left: Math.max(VIEWPORT_GAP, (viewport.width - width) / 2),
    top: Math.max(VIEWPORT_GAP, (viewport.height - height) / 2),
    width,
  };
}

export function toMemoryStarDetailRect(rect: DOMRect): MemoryStarDetailRect {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}
