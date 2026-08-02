import type { GameToReactEvent, ReactToGameEvent } from "./game-events";

export type ReactToGameListener = (event: ReactToGameEvent) => void;
export type GameToReactListener = (event: GameToReactEvent) => void;
export type UnsubscribeGameBridge = () => void;

export class GameBridge {
  private readonly reactToGameListeners = new Set<ReactToGameListener>();
  private readonly gameToReactListeners = new Set<GameToReactListener>();
  private isDestroyed = false;

  subscribeToGame(listener: ReactToGameListener): UnsubscribeGameBridge {
    if (this.isDestroyed) {
      throw new Error("Cannot subscribe to a destroyed GameBridge");
    }

    this.reactToGameListeners.add(listener);
    let isSubscribed = true;

    return () => {
      if (!isSubscribed) {
        return;
      }

      isSubscribed = false;
      this.reactToGameListeners.delete(listener);
    };
  }

  publishToGame(event: ReactToGameEvent): void {
    if (this.isDestroyed) {
      return;
    }

    for (const listener of [...this.reactToGameListeners]) {
      listener(event);
    }
  }

  subscribeToReact(listener: GameToReactListener): UnsubscribeGameBridge {
    if (this.isDestroyed) {
      throw new Error("Cannot subscribe to a destroyed GameBridge");
    }

    this.gameToReactListeners.add(listener);
    let isSubscribed = true;

    return () => {
      if (!isSubscribed) {
        return;
      }

      isSubscribed = false;
      this.gameToReactListeners.delete(listener);
    };
  }

  publishToReact(event: GameToReactEvent): void {
    if (this.isDestroyed) {
      return;
    }

    for (const listener of [...this.gameToReactListeners]) {
      listener(event);
    }
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.reactToGameListeners.clear();
    this.gameToReactListeners.clear();
  }
}
