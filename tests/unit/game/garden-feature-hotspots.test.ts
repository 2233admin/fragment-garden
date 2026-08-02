import { describe, expect, it } from "vitest";

import {
  CARD_MODE_ENTRY_DELAY_MS,
  GARDEN_FEATURE_HOTSPOTS,
  GARDEN_FEATURE_IDS,
  GARDEN_MODE_ENTRY_DELAY_MS,
} from "../../../game/config/garden-feature-hotspots";
import { GARDEN_MAP_CONFIG } from "../../../game/config/garden-map";

describe("garden feature hotspots", () => {
  it("keeps the two game UI entrances inside the fixed garden world", () => {
    expect(GARDEN_FEATURE_IDS).toEqual(["house", "backup"]);

    for (const hotspot of Object.values(GARDEN_FEATURE_HOTSPOTS)) {
      expect(hotspot.width).toBeGreaterThan(0);
      expect(hotspot.height).toBeGreaterThan(0);
      expect(hotspot.x - hotspot.width / 2).toBeGreaterThanOrEqual(0);
      expect(hotspot.y - hotspot.height / 2).toBeGreaterThanOrEqual(0);
      expect(hotspot.x + hotspot.width / 2).toBeLessThanOrEqual(GARDEN_MAP_CONFIG.width);
      expect(hotspot.y + hotspot.height / 2).toBeLessThanOrEqual(GARDEN_MAP_CONFIG.height);
    }
  });

  it("uses the product-approved delay in both directions", () => {
    expect(CARD_MODE_ENTRY_DELAY_MS).toBe(2_000);
    expect(GARDEN_MODE_ENTRY_DELAY_MS).toBe(2_000);
  });
});
