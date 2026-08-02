import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  COMPANION_CHARACTER_ASSETS,
  COMPANION_IDLE_FRAMES,
  GARDEN_ENTITY_SHADOW_ASSET,
  PLAYER_CHARACTER_ASSET,
  resolveCompanionIdleAnimationKey,
  resolveGardenCharacterTextureSource,
  resolvePlayerDirection,
  resolvePlayerFrame,
  resolvePlayerWalkAnimationKey,
  resolvePlayerWalkFrames,
} from "../../../game/config/garden-character-animations";

describe("garden character animation configuration", () => {
  it("keeps the four player directions on explicit source rows", () => {
    expect(resolvePlayerFrame("down")).toBe(0);
    expect(resolvePlayerFrame("right")).toBe(4);
    expect(resolvePlayerFrame("up")).toBe(8);
    expect(resolvePlayerFrame("left")).toBe(12);

    expect(resolvePlayerWalkFrames("down")).toEqual([0, 1, 0, 3]);
    expect(resolvePlayerWalkFrames("right")).toEqual([4, 5, 4, 7]);
    expect(resolvePlayerWalkFrames("up")).toEqual([8, 9, 8, 11]);
    expect(resolvePlayerWalkFrames("left")).toEqual([12, 13, 12, 15]);
  });

  it("resolves movement and arrival-facing directions without horizontal flipping", () => {
    const origin = { x: 160, y: 160 };

    expect(resolvePlayerDirection(origin, { x: 192, y: 160 })).toBe("right");
    expect(resolvePlayerDirection(origin, { x: 128, y: 160 })).toBe("left");
    expect(resolvePlayerDirection(origin, { x: 160, y: 128 })).toBe("up");
    expect(resolvePlayerDirection(origin, { x: 160, y: 192 })).toBe("down");
    expect(resolvePlayerDirection(origin, origin, "left")).toBe("left");
  });

  it("uses stable animation keys and a restrained companion idle sequence", () => {
    expect(resolvePlayerWalkAnimationKey("up")).toBe("garden-player-walk-up");
    expect(resolveCompanionIdleAnimationKey("cat")).toBe("garden-companion-cat-idle");
    expect(resolveCompanionIdleAnimationKey("dog")).toBe("garden-companion-dog-idle");
    expect(COMPANION_IDLE_FRAMES).toEqual([0, 1, 0, 3]);
  });

  it("falls back only when the formal texture is unavailable", () => {
    expect(resolveGardenCharacterTextureSource(true)).toBe("formal");
    expect(resolveGardenCharacterTextureSource(false)).toBe("fallback");
  });

  it("ships the minimum generated player, cat, dog, and shadow assets", () => {
    const publicDirectory = path.resolve(process.cwd(), "public");
    const assetPaths = [
      PLAYER_CHARACTER_ASSET.path,
      COMPANION_CHARACTER_ASSETS.cat.path,
      COMPANION_CHARACTER_ASSETS.dog.path,
      GARDEN_ENTITY_SHADOW_ASSET.path,
    ];

    for (const assetPath of assetPaths) {
      expect(existsSync(path.join(publicDirectory, assetPath))).toBe(true);
    }
  });
});
