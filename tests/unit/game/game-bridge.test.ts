import { describe, expect, it, vi } from "vitest";

import type { CompanionViewModel } from "../../../domain/garden/companion-view-model";
import type { PlantViewModel } from "../../../domain/garden/plant-view-model";
import { GameBridge } from "../../../game/bridge/game-bridge";
import type { GameToReactEvent, ReactToGameEvent } from "../../../game/bridge/game-events";

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

const CAT_COMPANION: CompanionViewModel = { type: "cat" };

function assertEventPayloadTypes(bridge: GameBridge): void {
  bridge.publishToGame({ type: "LOAD_GARDEN", plants: [PLANT] });
  bridge.publishToGame({ type: "ADD_PLANT", plant: PLANT });
  bridge.publishToGame({ type: "UPDATE_PLANT", plant: PLANT });
  bridge.publishToGame({ type: "REMOVE_PLANT", plantId: PLANT.plantId });
  bridge.publishToGame({ type: "CANCEL_INTERACTION" });
  bridge.publishToGame({ type: "SET_COMPANION", companion: CAT_COMPANION });
  bridge.publishToGame({ type: "SET_COMPANION", companion: null });
  bridge.publishToReact({
    type: "PLAYER_STATE_CHANGED",
    playerX: 496,
    playerY: 560,
    movementState: "idle",
    selectedPlantId: null,
  });
  bridge.publishToReact({ type: "PLAYER_REACHED_PLANT", plantId: PLANT.plantId });
  bridge.publishToReact({ type: "MOVEMENT_STARTED", targetType: "ground" });
  bridge.publishToReact({ type: "MOVEMENT_FAILED", reason: "target_blocked" });
  bridge.publishToReact({
    type: "MOVEMENT_FAILED",
    reason: "plant_unavailable",
    targetId: PLANT.plantId,
  });
  bridge.publishToReact({ type: "COMPANION_CLICKED" });

  // @ts-expect-error LOAD_GARDEN requires a plants array.
  bridge.publishToGame({ type: "LOAD_GARDEN" });
  // @ts-expect-error ADD_PLANT requires a complete PlantViewModel.
  bridge.publishToGame({ type: "ADD_PLANT", plantId: PLANT.plantId });
  // @ts-expect-error PLAYER_REACHED_PLANT requires a plant id.
  bridge.publishToReact({ type: "PLAYER_REACHED_PLANT" });
  // @ts-expect-error Movement targets only use the documented target types.
  bridge.publishToReact({ type: "MOVEMENT_STARTED", targetType: "companion" });
  // @ts-expect-error Movement failures only use the documented reasons.
  bridge.publishToReact({ type: "MOVEMENT_FAILED", reason: "unknown" });
  // @ts-expect-error SET_COMPANION accepts only the two documented companion types.
  bridge.publishToGame({ type: "SET_COMPANION", companion: { type: "fox" } });
  // @ts-expect-error COMPANION_CLICKED does not carry Settings or companion details.
  bridge.publishToReact({ type: "COMPANION_CLICKED", companionType: "cat" });
  bridge.publishToReact({
    type: "PLAYER_STATE_CHANGED",
    playerX: 496,
    playerY: 560,
    // @ts-expect-error Player state cannot use an arbitrary movement state.
    movementState: "paused",
    selectedPlantId: null,
  });
}

describe("GameBridge", () => {
  it("publishes React events only to game subscribers", () => {
    const bridge = new GameBridge();
    const gameListener = vi.fn();
    const reactListener = vi.fn();
    const event: ReactToGameEvent = { type: "LOAD_GARDEN", plants: [PLANT] };

    bridge.subscribeToGame(gameListener);
    bridge.subscribeToReact(reactListener);
    bridge.publishToGame(event);

    expect(gameListener).toHaveBeenCalledOnce();
    expect(gameListener).toHaveBeenCalledWith(event);
    expect(reactListener).not.toHaveBeenCalled();
  });

  it("publishes reached and failed events only to React subscribers", () => {
    const bridge = new GameBridge();
    const gameListener = vi.fn();
    const reactListener = vi.fn();
    const reachedEvent: GameToReactEvent = {
      type: "PLAYER_REACHED_PLANT",
      plantId: PLANT.plantId,
    };
    const failedEvent: GameToReactEvent = {
      type: "MOVEMENT_FAILED",
      reason: "path_not_found",
      targetId: PLANT.plantId,
    };

    bridge.subscribeToGame(gameListener);
    bridge.subscribeToReact(reactListener);
    bridge.publishToReact(reachedEvent);
    bridge.publishToReact(failedEvent);

    expect(reactListener).toHaveBeenNthCalledWith(1, reachedEvent);
    expect(reactListener).toHaveBeenNthCalledWith(2, failedEvent);
    expect(gameListener).not.toHaveBeenCalled();
  });

  it("publishes a payload-free companion click and stops after unsubscribe", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.subscribeToReact(listener);

    bridge.publishToReact({ type: "COMPANION_CLICKED" });
    unsubscribe();
    bridge.publishToReact({ type: "COMPANION_CLICKED" });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "COMPANION_CLICKED" });
  });

  it("stops delivering either direction after unsubscribe", () => {
    const bridge = new GameBridge();
    const gameListener = vi.fn();
    const reactListener = vi.fn();
    const unsubscribeGame = bridge.subscribeToGame(gameListener);
    const unsubscribeReact = bridge.subscribeToReact(reactListener);

    unsubscribeGame();
    unsubscribeGame();
    unsubscribeReact();
    unsubscribeReact();
    bridge.publishToGame({ type: "LOAD_GARDEN", plants: [PLANT] });
    bridge.publishToReact({ type: "PLAYER_REACHED_PLANT", plantId: PLANT.plantId });

    expect(gameListener).not.toHaveBeenCalled();
    expect(reactListener).not.toHaveBeenCalled();
  });

  it("does not duplicate a listener during a Strict Mode style resubscription", () => {
    const bridge = new GameBridge();
    const listener = vi.fn();
    const firstCleanup = bridge.subscribeToReact(listener);

    firstCleanup();
    bridge.subscribeToReact(listener);
    bridge.subscribeToReact(listener);
    bridge.publishToReact({ type: "PLAYER_REACHED_PLANT", plantId: PLANT.plantId });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps bridge instances isolated", () => {
    const firstBridge = new GameBridge();
    const secondBridge = new GameBridge();
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    firstBridge.subscribeToReact(firstListener);
    secondBridge.subscribeToReact(secondListener);
    firstBridge.publishToReact({ type: "PLAYER_REACHED_PLANT", plantId: PLANT.plantId });

    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).not.toHaveBeenCalled();
  });

  it("clears both directions on destroy and remains inert when destroyed again", () => {
    const bridge = new GameBridge();
    const gameListener = vi.fn();
    const reactListener = vi.fn();

    bridge.subscribeToGame(gameListener);
    bridge.subscribeToReact(reactListener);
    bridge.destroy();
    bridge.destroy();
    bridge.publishToGame({ type: "REMOVE_PLANT", plantId: PLANT.plantId });
    bridge.publishToReact({ type: "MOVEMENT_FAILED", reason: "target_blocked" });

    expect(gameListener).not.toHaveBeenCalled();
    expect(reactListener).not.toHaveBeenCalled();
    expect(() => bridge.subscribeToGame(gameListener)).toThrow(/destroyed GameBridge/u);
    expect(() => bridge.subscribeToReact(reactListener)).toThrow(/destroyed GameBridge/u);
  });

  it("keeps invalid event payloads as compile-time failures", () => {
    expect(typeof assertEventPayloadTypes).toBe("function");
  });
});
