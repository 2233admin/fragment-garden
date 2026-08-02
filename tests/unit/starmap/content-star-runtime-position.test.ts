import { describe, expect, it } from "vitest";

import { deriveStarPosition, type StarViewModel } from "../../../domain";
import { resolveContentStarRuntimePosition } from "../../../starmap/runtime/content-star-runtime-position";

function star(fragmentId: string): StarViewModel {
  return {
    fragmentId,
    title: fragmentId,
    contentType: "text",
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    position: deriveStarPosition(fragmentId),
    userNoteCount: 0,
    brightness: 1,
  };
}

describe("resolveContentStarRuntimePosition", () => {
  it("uses the stable pending position until the real runtime snapshot catches up", () => {
    const fragmentId = "newly-persisted-fragment";
    const pendingPosition = deriveStarPosition(fragmentId);

    expect(resolveContentStarRuntimePosition([], fragmentId, pendingPosition)).toEqual(
      pendingPosition,
    );

    const runtimeStar = star(fragmentId);
    expect(resolveContentStarRuntimePosition([runtimeStar], fragmentId, { x: 1, y: 2, z: 3 })).toBe(
      runtimeStar.position,
    );
    expect(resolveContentStarRuntimePosition([], fragmentId)).toBeNull();
  });
});
