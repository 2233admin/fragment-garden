import type { StarPosition, StarViewModel } from "../../domain";

/**
 * A newly persisted Fragment can reach React before Dexie's live snapshot reaches Three.js.
 * Use its domain-derived position during that brief gap; the runtime snapshot remains authoritative
 * as soon as the real content star is present.
 */
export function resolveContentStarRuntimePosition(
  stars: readonly StarViewModel[],
  fragmentId: string,
  pendingPosition: StarPosition | null = null,
): StarPosition | null {
  return stars.find((star) => star.fragmentId === fragmentId)?.position ?? pendingPosition;
}
