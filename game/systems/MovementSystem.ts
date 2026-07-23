import {
  advanceRouteMotion,
  cancelRouteMotion,
  createGridRouteWaypoints,
  createRouteMotion,
  type GridPosition,
  type RouteMotionState,
} from "../../domain";
import { PLAYER_MOVE_SPEED } from "../config/movement-config";
import type { PlayerSprite } from "../entities/PlayerSprite";
import type { PathfindingSystem } from "./PathfindingSystem";

export type MovementState = "idle" | "moving";

export type MovementSnapshot = Readonly<{
  x: number;
  y: number;
  state: MovementState;
}>;

type ArrivalHandler = () => void;
type MovementSnapshotHandler = (snapshot: MovementSnapshot) => void;

function isAtPosition(
  left: Readonly<{ x: number; y: number }>,
  right: Readonly<{ x: number; y: number }>,
): boolean {
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001;
}

export class MovementSystem {
  private motionState: RouteMotionState;
  private arrivalHandler: ArrivalHandler | null = null;
  private isDestroyed = false;

  constructor(
    private readonly player: PlayerSprite,
    private readonly pathfinding: PathfindingSystem,
    private readonly onSnapshot: MovementSnapshotHandler,
    private readonly speed = PLAYER_MOVE_SPEED,
  ) {
    this.motionState = createRouteMotion({ x: player.x, y: player.y }, []);
    this.reportSnapshot();
  }

  get position(): Readonly<{ x: number; y: number }> {
    return this.motionState.position;
  }

  get state(): MovementState {
    return this.motionState.status;
  }

  start(path: readonly GridPosition[], target: GridPosition, onArrive: ArrivalHandler): void {
    if (this.isDestroyed) {
      throw new Error("Cannot start a destroyed MovementSystem");
    }

    this.stop();
    const waypoints = createGridRouteWaypoints({
      currentPosition: this.motionState.position,
      start: this.pathfinding.worldToGrid(this.motionState.position),
      path,
      gridSize: this.pathfinding.gridSize,
    });
    const targetWorldPosition = this.pathfinding.gridToWorld(target);

    if (waypoints.length === 0 && !isAtPosition(this.motionState.position, targetWorldPosition)) {
      waypoints.push(targetWorldPosition);
    }

    if (waypoints.length === 0) {
      this.player.setMoving(false);
      this.reportSnapshot();
      onArrive();
      return;
    }

    this.arrivalHandler = onArrive;
    this.motionState = createRouteMotion(this.motionState.position, waypoints);
    this.player.setMoving(true);
    this.reportSnapshot();
  }

  update(deltaMilliseconds: number): void {
    if (this.isDestroyed || this.motionState.status === "idle") {
      return;
    }

    const update = advanceRouteMotion(
      this.motionState,
      this.speed * (Math.max(deltaMilliseconds, 0) / 1_000),
    );
    this.motionState = update.state;
    this.player.setMovementPosition(update.state.position.x, update.state.position.y);

    if (update.didArrive) {
      this.player.setMoving(false);
      const onArrive = this.arrivalHandler;
      this.arrivalHandler = null;
      this.reportSnapshot();
      onArrive?.();
      return;
    }
  }

  stop(): void {
    this.arrivalHandler = null;
    this.motionState = cancelRouteMotion({
      ...this.motionState,
      position: { x: this.player.x, y: this.player.y },
    });
    this.player.setMoving(false);
    this.reportSnapshot();
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.stop();
    this.isDestroyed = true;
  }

  private reportSnapshot(): void {
    if (this.isDestroyed) {
      return;
    }

    this.onSnapshot({
      x: this.motionState.position.x,
      y: this.motionState.position.y,
      state: this.motionState.status,
    });
  }
}
