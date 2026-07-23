import { describe, expect, it, vi } from "vitest";

import type { PlantViewModel } from "../../../domain/garden/plant-view-model";
import { GameBridge } from "../../../game/bridge/game-bridge";
import type { ReactToGameEvent } from "../../../game/bridge/game-events";

const PLANT: PlantViewModel = {
  plantId: "plant-01",
  fragmentId: "fragment-01",
  slotId: "slot-01",
  title: "第一株植物",
  speciesId: null,
  stage: "seedling",
  vitality: "active",
  completionStatus: "open",
};

function assertEventPayloadTypes(bridge: GameBridge): void {
  bridge.publish({ type: "LOAD_GARDEN", plants: [PLANT] });
  bridge.publish({ type: "ADD_PLANT", plant: PLANT });
  bridge.publish({ type: "UPDATE_PLANT", plant: PLANT });
  bridge.publish({ type: "REMOVE_PLANT", plantId: PLANT.plantId });

  // @ts-expect-error LOAD_GARDEN requires a plants array.
  bridge.publish({ type: "LOAD_GARDEN" });
  // @ts-expect-error ADD_PLANT requires a complete PlantViewModel.
  bridge.publish({ type: "ADD_PLANT", plantId: PLANT.plantId });
  // @ts-expect-error Stage 3 does not expose scene click events.
  bridge.publish({ type: "PLANT_CLICKED", plantId: PLANT.plantId });
}

describe("GameBridge", () => {
  it("publishes a LOAD_GARDEN event to subscribers", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    const event: ReactToGameEvent = { type: "LOAD_GARDEN", plants: [PLANT] };

    bridge.subscribe(listener);
    bridge.publish(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);
  });

  it("stops delivering events after unsubscribe", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe(listener);

    unsubscribe();
    unsubscribe();
    bridge.publish({ type: "LOAD_GARDEN", plants: [PLANT] });

    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps bridge instances isolated", () => {
    const firstBridge = new GameBridge();
    const secondBridge = new GameBridge();
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    firstBridge.subscribe(firstListener);
    secondBridge.subscribe(secondListener);
    firstBridge.publish({ type: "ADD_PLANT", plant: PLANT });

    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).not.toHaveBeenCalled();
  });

  it("does not register the same listener twice", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();

    bridge.subscribe(listener);
    bridge.subscribe(listener);
    bridge.publish({ type: "LOAD_GARDEN", plants: [PLANT] });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("clears listeners on destroy and remains inert when destroyed again", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();

    bridge.subscribe(listener);
    bridge.destroy();
    bridge.destroy();
    bridge.publish({ type: "REMOVE_PLANT", plantId: PLANT.plantId });

    expect(listener).not.toHaveBeenCalled();
    expect(() => bridge.subscribe(listener)).toThrow(/destroyed GameBridge/u);
  });

  it("keeps invalid event payloads as compile-time failures", () => {
    expect(typeof assertEventPayloadTypes).toBe("function");
  });
});
