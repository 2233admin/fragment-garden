import { describe, expect, it } from "vitest";

import { resolveGardenEventResponse } from "../../../components/garden/garden-event-response";
import type { PlantViewModel } from "../../../domain";

const PLANT: PlantViewModel = {
  plantId: "plant-01",
  fragmentId: "fragment-01",
  slotId: "slot-01",
  title: "旧灵感",
  speciesId: null,
  stage: "seedling",
  vitality: "active",
  completionStatus: "open",
};

describe("garden game event response", () => {
  it("opens the mapped fragment only after the player reaches a plant", () => {
    expect(
      resolveGardenEventResponse({ type: "PLAYER_REACHED_PLANT", plantId: PLANT.plantId }, [PLANT]),
    ).toEqual({
      type: "open_fragment",
      fragmentId: PLANT.fragmentId,
      plantId: PLANT.plantId,
    });
  });

  it("directly opens the mapped fragment with the fallback notice after plant movement fails", () => {
    expect(
      resolveGardenEventResponse(
        {
          type: "MOVEMENT_FAILED",
          reason: "path_not_found",
          targetId: PLANT.plantId,
        },
        [PLANT],
      ),
    ).toEqual({
      type: "open_fragment",
      fragmentId: PLANT.fragmentId,
      plantId: PLANT.plantId,
      successMessage: "暂时无法走到这株植物，已直接为你打开内容。",
    });
  });

  it("never opens a fragment for an ordinary blocked ground target", () => {
    expect(
      resolveGardenEventResponse({ type: "MOVEMENT_FAILED", reason: "target_blocked" }, [PLANT]),
    ).toEqual({
      type: "error",
      message: "这里暂时不能通行，请换一块草地或道路。",
    });
  });

  it("does not substitute another fragment when a plant is unavailable", () => {
    expect(
      resolveGardenEventResponse(
        {
          type: "MOVEMENT_FAILED",
          reason: "plant_unavailable",
          targetId: "removed-plant",
        },
        [PLANT],
      ),
    ).toEqual({
      type: "error",
      message: "这株植物已不在当前花园中，没有打开其他碎片。",
    });
  });
});
