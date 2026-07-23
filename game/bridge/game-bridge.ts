import type { ReactToGameEvent } from "./game-events";

export type GameBridgeListener = (event: ReactToGameEvent) => void;
export type UnsubscribeGameBridge = () => void;

export class GameBridge {
  private readonly listeners = new Set<GameBridgeListener>();
  private isDestroyed = false;

  subscribe(listener: GameBridgeListener): UnsubscribeGameBridge {
    if (this.isDestroyed) {
      throw new Error("Cannot subscribe to a destroyed GameBridge");
    }

    this.listeners.add(listener);
    let isSubscribed = true;

    return () => {
      if (!isSubscribed) {
        return;
      }

      isSubscribed = false;
      this.listeners.delete(listener);
    };
  }

  publish(event: ReactToGameEvent): void {
    if (this.isDestroyed) {
      return;
    }

    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.listeners.clear();
  }
}
