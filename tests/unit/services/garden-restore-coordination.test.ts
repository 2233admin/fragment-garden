import { describe, expect, it } from "vitest";

import { runWithGardenRestoreLock } from "../../../services/garden-restore-coordination";

describe("garden restore coordination", () => {
  it("serializes fallback restore work when Web Locks are unavailable", async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runWithGardenRestoreLock(async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
    });
    const second = runWithGardenRestoreLock(async () => {
      order.push("second:start");
      order.push("second:end");
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });
});
