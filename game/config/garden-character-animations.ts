import type { CompanionType } from "../../domain";

export type PlayerDirection = "down" | "up" | "left" | "right";
export type GardenCharacterTextureSource = "formal" | "fallback";

export const PLAYER_CHARACTER_ASSET = Object.freeze({
  frameHeight: 64,
  frameWidth: 32,
  key: "garden-player-formal",
  path: "/assets/garden/characters/player.png",
});

export const COMPANION_CHARACTER_ASSETS: Readonly<
  Record<
    CompanionType,
    Readonly<{
      frameHeight: number;
      frameWidth: number;
      key: string;
      path: string;
    }>
  >
> = Object.freeze({
  cat: Object.freeze({
    frameHeight: 52,
    frameWidth: 48,
    key: "garden-companion-cat",
    path: "/assets/garden/characters/companion-cat.png",
  }),
  dog: Object.freeze({
    frameHeight: 52,
    frameWidth: 48,
    key: "garden-companion-dog",
    path: "/assets/garden/characters/companion-dog.png",
  }),
});

export const GARDEN_ENTITY_SHADOW_ASSET = Object.freeze({
  key: "garden-entity-shadow",
  path: "/assets/garden/characters/entity-shadow.png",
});

const PLAYER_DIRECTION_ROWS: Readonly<Record<PlayerDirection, number>> = Object.freeze({
  down: 0,
  right: 1,
  up: 2,
  left: 3,
});

const PLAYER_FRAME_COLUMNS = 4;

export const PLAYER_WALK_FRAME_RATE = 8;
export const COMPANION_IDLE_FRAME_RATE = 3;
export const COMPANION_IDLE_FRAMES = Object.freeze([0, 1, 0, 3]);

export function resolveGardenCharacterTextureSource(
  hasFormalTexture: boolean,
): GardenCharacterTextureSource {
  return hasFormalTexture ? "formal" : "fallback";
}

export function resolvePlayerFrame(direction: PlayerDirection, column = 0): number {
  const safeColumn = Number.isInteger(column)
    ? Math.min(PLAYER_FRAME_COLUMNS - 1, Math.max(0, column))
    : 0;

  return PLAYER_DIRECTION_ROWS[direction] * PLAYER_FRAME_COLUMNS + safeColumn;
}

export function resolvePlayerWalkFrames(direction: PlayerDirection): readonly number[] {
  return Object.freeze([
    resolvePlayerFrame(direction, 0),
    resolvePlayerFrame(direction, 1),
    resolvePlayerFrame(direction, 0),
    resolvePlayerFrame(direction, 3),
  ]);
}

export function resolvePlayerWalkAnimationKey(direction: PlayerDirection): string {
  return `garden-player-walk-${direction}`;
}

export function resolveCompanionIdleAnimationKey(type: CompanionType): string {
  return `garden-companion-${type}-idle`;
}

export function resolvePlayerDirection(
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }>,
  fallback: PlayerDirection = "down",
): PlayerDirection {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;

  if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) {
    return fallback;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX < 0 ? "left" : "right";
  }

  return deltaY < 0 ? "up" : "down";
}
