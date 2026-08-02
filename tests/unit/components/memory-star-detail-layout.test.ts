import { describe, expect, it } from "vitest";

import {
  resolveCompactDetailLayout,
  resolveExpandedDetailRect,
} from "../../../components/starmap/memory-star-detail-layout";

describe("memory star detail layout", () => {
  it("places the compact card beside a centred content star", () => {
    const layout = resolveCompactDetailLayout(
      { clientX: 720, clientY: 450 },
      { height: 900, width: 1440 },
    );

    expect(layout).toMatchObject({ isAnchored: true, placement: "right" });
    expect(layout.left).toBeGreaterThan(720);
    expect(layout.left + layout.width).toBeLessThanOrEqual(1424);
  });

  it("moves the compact card to the left near the right edge", () => {
    const layout = resolveCompactDetailLayout(
      { clientX: 1030, clientY: 400 },
      { height: 800, width: 1100 },
    );

    expect(layout).toMatchObject({ isAnchored: true, placement: "left" });
    expect(layout.left + layout.width).toBeLessThan(1030);
  });

  it("uses a vertical placement in a narrow viewport without covering the star", () => {
    const anchor = { clientX: 180, clientY: 520 };
    const layout = resolveCompactDetailLayout(anchor, { height: 720, width: 360 });

    expect(layout).toMatchObject({ isAnchored: true, placement: "above" });
    expect(layout.top + layout.height).toBeLessThan(anchor.clientY);
  });

  it("keeps the expanded detail within viewport bounds", () => {
    const layout = resolveExpandedDetailRect({ height: 800, width: 1100 });

    expect(layout.width).toBe(720);
    expect(layout.height).toBe(624);
    expect(layout.left).toBeGreaterThanOrEqual(16);
    expect(layout.top).toBeGreaterThanOrEqual(16);
    expect(layout.left + layout.width).toBeLessThanOrEqual(1100);
    expect(layout.top + layout.height).toBeLessThanOrEqual(800);
  });
});
