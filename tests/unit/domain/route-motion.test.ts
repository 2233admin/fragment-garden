import { describe, expect, it } from "vitest";

import {
  advanceRouteMotion,
  cancelRouteMotion,
  createGridRouteWaypoints,
  createRouteMotion,
} from "../../../domain";

describe("route motion state", () => {
  it("consumes path nodes in order using distance rather than frames", () => {
    const state = createRouteMotion({ x: 0, y: 0 }, [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
    const firstUpdate = advanceRouteMotion(state, 15);

    expect(firstUpdate.didArrive).toBe(false);
    expect(firstUpdate.state.position).toEqual({ x: 15, y: 0 });
    expect(firstUpdate.state.remainingWaypoints).toEqual([{ x: 20, y: 0 }]);

    const secondUpdate = advanceRouteMotion(firstUpdate.state, 5);
    expect(secondUpdate.didArrive).toBe(true);
    expect(secondUpdate.state.position).toEqual({ x: 20, y: 0 });
    expect(secondUpdate.state.status).toBe("idle");

    expect(advanceRouteMotion(secondUpdate.state, 5).didArrive).toBe(false);
  });

  it("replaces an old route when a new route state is created", () => {
    const oldState = createRouteMotion({ x: 0, y: 0 }, [{ x: 10, y: 0 }]);
    const replacement = createRouteMotion(oldState.position, [{ x: 0, y: 10 }]);

    expect(replacement.remainingWaypoints).toEqual([{ x: 0, y: 10 }]);
    expect(replacement.remainingWaypoints).not.toContainEqual({ x: 10, y: 0 });
  });

  it("returns to the current cell center before an orthogonal mid-route redirect", () => {
    const waypoints = createGridRouteWaypoints({
      currentPosition: { x: 128, y: 112 },
      start: { column: 4, row: 3 },
      path: [
        { column: 4, row: 4 },
        { column: 4, row: 5 },
      ],
      gridSize: 32,
    });

    expect(waypoints).toEqual([
      { x: 144, y: 112 },
      { x: 144, y: 144 },
      { x: 144, y: 176 },
    ]);

    const firstSegment = advanceRouteMotion(createRouteMotion({ x: 128, y: 112 }, waypoints), 8);
    expect(firstSegment.state.position).toEqual({ x: 136, y: 112 });

    const secondSegment = advanceRouteMotion(firstSegment.state, 16);
    expect(secondSegment.state.position).toEqual({ x: 144, y: 120 });
  });

  it("stops consuming nodes after cancellation", () => {
    const state = createRouteMotion({ x: 0, y: 0 }, [{ x: 10, y: 0 }]);
    const cancelled = cancelRouteMotion(state);

    expect(cancelled.status).toBe("idle");
    expect(cancelled.remainingWaypoints).toEqual([]);
    expect(advanceRouteMotion(cancelled, 20)).toEqual({
      state: cancelled,
      didArrive: false,
    });
  });
});
