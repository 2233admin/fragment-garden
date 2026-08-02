import { describe, expect, it } from "vitest";

import {
  STAR_BRIGHTNESS_MAX,
  STAR_BRIGHTNESS_MIN,
  STAR_BRIGHTNESS_SATURATION_NOTE_COUNT,
  STAR_POSITION_MAX_RADIUS,
  STAR_POSITION_MIN_RADIUS,
  STARFIELD_ROTATION_SATURATION_COUNT,
  STARFIELD_ROTATION_SPEED_MAX,
  STARFIELD_ROTATION_SPEED_MIN,
  deriveStarBrightness,
  deriveStarPosition,
  deriveStarfieldRotationSpeed,
} from "../../../domain";

function positionRadius(position: ReturnType<typeof deriveStarPosition>): number {
  return Math.hypot(position.x, position.y, position.z);
}

describe("deriveStarPosition", () => {
  it("returns the same position for the same fragment id", () => {
    expect(deriveStarPosition("fragment-stable")).toEqual(deriveStarPosition("fragment-stable"));
  });

  it("distributes different ids across the configured spherical shell", () => {
    const positions = Array.from({ length: 64 }, (_, index) =>
      deriveStarPosition(`fragment-${index}`),
    );
    const uniquePositions = new Set(
      positions.map((position) => `${position.x}:${position.y}:${position.z}`),
    );

    expect(uniquePositions.size).toBe(positions.length);
    expect(positions.some((position) => position.x < 0)).toBe(true);
    expect(positions.some((position) => position.x > 0)).toBe(true);
    expect(positions.some((position) => position.y < 0)).toBe(true);
    expect(positions.some((position) => position.y > 0)).toBe(true);
    expect(positions.some((position) => position.z < 0)).toBe(true);
    expect(positions.some((position) => position.z > 0)).toBe(true);

    for (const position of positions) {
      expect(positionRadius(position)).toBeGreaterThanOrEqual(STAR_POSITION_MIN_RADIUS);
      expect(positionRadius(position)).toBeLessThan(STAR_POSITION_MAX_RADIUS);
    }
  });
});

describe("deriveStarBrightness", () => {
  it("makes the first additions visible and saturates at a fixed upper bound", () => {
    const base = deriveStarBrightness(0);
    const firstAddition = deriveStarBrightness(1);
    const secondAddition = deriveStarBrightness(2);
    const saturated = deriveStarBrightness(STAR_BRIGHTNESS_SATURATION_NOTE_COUNT);

    expect(base).toBe(STAR_BRIGHTNESS_MIN);
    expect(firstAddition).toBeGreaterThan(base);
    expect(secondAddition).toBeGreaterThan(firstAddition);
    expect(saturated).toBeCloseTo(STAR_BRIGHTNESS_MAX, 10);
    expect(deriveStarBrightness(10_000)).toBeCloseTo(STAR_BRIGHTNESS_MAX, 10);
  });

  it("normalizes invalid and fractional counts", () => {
    expect(deriveStarBrightness(Number.NaN)).toBe(STAR_BRIGHTNESS_MIN);
    expect(deriveStarBrightness(-1)).toBe(STAR_BRIGHTNESS_MIN);
    expect(deriveStarBrightness(1.9)).toBe(deriveStarBrightness(1));
  });
});

describe("deriveStarfieldRotationSpeed", () => {
  it("starts slowly, grows smoothly with content, and never exceeds the cap", () => {
    const emptySpeed = deriveStarfieldRotationSpeed(0);
    const firstStarSpeed = deriveStarfieldRotationSpeed(1);
    const fiveStarSpeed = deriveStarfieldRotationSpeed(5);
    const growingGardenSpeed = deriveStarfieldRotationSpeed(18);
    const fullGardenSpeed = deriveStarfieldRotationSpeed(36);
    const largeArchiveSpeed = deriveStarfieldRotationSpeed(100);
    const extremeSpeed = deriveStarfieldRotationSpeed(1_000_000);

    expect(emptySpeed).toBe(STARFIELD_ROTATION_SPEED_MIN);
    expect(STARFIELD_ROTATION_SATURATION_COUNT).toBe(32);
    expect(firstStarSpeed).toBeGreaterThan(emptySpeed);
    expect(fiveStarSpeed).toBeGreaterThan(firstStarSpeed);
    expect(growingGardenSpeed).toBeGreaterThan(fiveStarSpeed);
    expect(fullGardenSpeed).toBeGreaterThan(growingGardenSpeed);
    expect(largeArchiveSpeed).toBeGreaterThan(fullGardenSpeed);
    expect(fiveStarSpeed).toBeCloseTo(0.002967, 6);
    expect(growingGardenSpeed).toBeCloseTo(0.00448, 6);
    expect(fullGardenSpeed).toBeCloseTo(0.005779, 6);
    expect(extremeSpeed).toBe(STARFIELD_ROTATION_SPEED_MAX);
    expect(extremeSpeed).toBeLessThanOrEqual(STARFIELD_ROTATION_SPEED_MAX);
  });

  it("normalizes invalid, negative, and fractional counts", () => {
    expect(deriveStarfieldRotationSpeed(Number.NaN)).toBe(STARFIELD_ROTATION_SPEED_MIN);
    expect(deriveStarfieldRotationSpeed(-10)).toBe(STARFIELD_ROTATION_SPEED_MIN);
    expect(deriveStarfieldRotationSpeed(1.9)).toBe(deriveStarfieldRotationSpeed(1));
  });
});
