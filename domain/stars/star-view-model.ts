import type { Fragment, FragmentContentType, FragmentNote } from "../shared/types";

export const STAR_LAYOUT_VERSION = "memory-starmap-v1";
export const STAR_POSITION_MIN_RADIUS = 24;
export const STAR_POSITION_MAX_RADIUS = 52;
export const STAR_BRIGHTNESS_MIN = 1;
export const STAR_BRIGHTNESS_MAX = 2.8;
export const STAR_BRIGHTNESS_SATURATION_NOTE_COUNT = 8;
export const STARFIELD_ROTATION_SPEED_MIN = 0.0022;
export const STARFIELD_ROTATION_SPEED_MAX = 0.0075;
export const STARFIELD_ROTATION_SATURATION_COUNT = 32;

const STAR_BRIGHTNESS_CURVE_SCALE = 2.5;
const UINT32_RANGE = 4_294_967_296;
const TWO_PI = Math.PI * 2;

export type StarPosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type StarViewModel = Readonly<{
  fragmentId: string;
  title: string;
  contentType: FragmentContentType;
  createdAt: string;
  updatedAt: string;
  position: StarPosition;
  userNoteCount: number;
  brightness: number;
}>;

export type StarMapSnapshot = Readonly<{
  stars: readonly StarViewModel[];
  contentStarCount: number;
  rotationSpeedRadiansPerSecond: number;
}>;

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

function hashToUnitInterval(fragmentId: string, channel: string): number {
  return hashString(`${STAR_LAYOUT_VERSION}:${channel}:${fragmentId}`) / UINT32_RANGE;
}

/** Stable spherical placement avoids storing presentation-only coordinates in IndexedDB. */
export function deriveStarPosition(fragmentId: string): StarPosition {
  const vertical = hashToUnitInterval(fragmentId, "vertical") * 2 - 1;
  const angle = hashToUnitInterval(fragmentId, "angle") * TWO_PI;
  const radius =
    STAR_POSITION_MIN_RADIUS +
    hashToUnitInterval(fragmentId, "radius") *
      (STAR_POSITION_MAX_RADIUS - STAR_POSITION_MIN_RADIUS);
  const horizontalRadius = Math.sqrt(Math.max(0, 1 - vertical * vertical));

  return {
    x: radius * horizontalRadius * Math.cos(angle),
    y: radius * vertical,
    z: radius * horizontalRadius * Math.sin(angle),
  };
}

export function deriveStarBrightness(userNoteCount: number): number {
  const normalizedCount = Math.min(
    normalizeCount(userNoteCount),
    STAR_BRIGHTNESS_SATURATION_NOTE_COUNT,
  );

  if (normalizedCount === 0) {
    return STAR_BRIGHTNESS_MIN;
  }

  const saturation =
    1 - Math.exp(-STAR_BRIGHTNESS_SATURATION_NOTE_COUNT / STAR_BRIGHTNESS_CURVE_SCALE);
  const progress = (1 - Math.exp(-normalizedCount / STAR_BRIGHTNESS_CURVE_SCALE)) / saturation;

  return STAR_BRIGHTNESS_MIN + (STAR_BRIGHTNESS_MAX - STAR_BRIGHTNESS_MIN) * progress;
}

export function deriveStarfieldRotationSpeed(contentStarCount: number): number {
  const normalizedCount = normalizeCount(contentStarCount);
  const progress = 1 - Math.exp(-normalizedCount / STARFIELD_ROTATION_SATURATION_COUNT);
  const speed =
    STARFIELD_ROTATION_SPEED_MIN +
    (STARFIELD_ROTATION_SPEED_MAX - STARFIELD_ROTATION_SPEED_MIN) * progress;

  return Math.min(STARFIELD_ROTATION_SPEED_MAX, speed);
}

function compareFragments(left: Fragment, right: Fragment): number {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
}

export function buildStarMapSnapshot(
  fragments: readonly Fragment[],
  notes: readonly FragmentNote[],
): StarMapSnapshot {
  const userNoteCountByFragmentId = new Map<string, number>();

  for (const note of notes) {
    if (note.source !== "user") {
      continue;
    }

    userNoteCountByFragmentId.set(
      note.fragmentId,
      (userNoteCountByFragmentId.get(note.fragmentId) ?? 0) + 1,
    );
  }

  const stars = fragments
    .filter((fragment) => fragment.lifecycleStatus !== "deleted")
    .slice()
    .sort(compareFragments)
    .map((fragment): StarViewModel => {
      const userNoteCount = userNoteCountByFragmentId.get(fragment.id) ?? 0;

      return {
        fragmentId: fragment.id,
        title: fragment.title,
        contentType: fragment.contentType,
        createdAt: fragment.createdAt,
        updatedAt: fragment.updatedAt,
        position: deriveStarPosition(fragment.id),
        userNoteCount,
        brightness: deriveStarBrightness(userNoteCount),
      };
    });

  return {
    stars,
    contentStarCount: stars.length,
    rotationSpeedRadiansPerSecond: deriveStarfieldRotationSpeed(stars.length),
  };
}
