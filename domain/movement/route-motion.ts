import { gridToWorldPosition, type GridPosition, type WorldPosition } from "./geometry";

export type RouteMotionState = Readonly<{
  position: WorldPosition;
  remainingWaypoints: readonly WorldPosition[];
  status: "idle" | "moving";
}>;

export type RouteMotionUpdate = Readonly<{
  state: RouteMotionState;
  didArrive: boolean;
}>;

function distanceBetween(left: WorldPosition, right: WorldPosition): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function isAtPosition(left: WorldPosition, right: WorldPosition): boolean {
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001;
}

export function createGridRouteWaypoints({
  currentPosition,
  start,
  path,
  gridSize,
}: Readonly<{
  currentPosition: WorldPosition;
  start: GridPosition;
  path: readonly GridPosition[];
  gridSize: number;
}>): WorldPosition[] {
  const startCenter = gridToWorldPosition(start, gridSize);
  const waypoints = path.map((position) => gridToWorldPosition(position, gridSize));

  if (!isAtPosition(currentPosition, startCenter)) {
    waypoints.unshift(startCenter);
  }

  return waypoints;
}

export function createRouteMotion(
  position: WorldPosition,
  waypoints: readonly WorldPosition[],
): RouteMotionState {
  return {
    position: { ...position },
    remainingWaypoints: waypoints.map((waypoint) => ({ ...waypoint })),
    status: waypoints.length === 0 ? "idle" : "moving",
  };
}

export function cancelRouteMotion(state: RouteMotionState): RouteMotionState {
  return {
    position: state.position,
    remainingWaypoints: [],
    status: "idle",
  };
}

export function advanceRouteMotion(
  state: RouteMotionState,
  travelDistance: number,
): RouteMotionUpdate {
  if (!Number.isFinite(travelDistance) || travelDistance < 0) {
    throw new Error("Travel distance must be a finite non-negative number");
  }

  if (state.status === "idle" || state.remainingWaypoints.length === 0) {
    return { state, didArrive: false };
  }

  let position = state.position;
  let remainingDistance = travelDistance;
  let waypointIndex = 0;

  while (waypointIndex < state.remainingWaypoints.length) {
    const waypoint = state.remainingWaypoints[waypointIndex];

    if (waypoint === undefined) {
      break;
    }

    const distanceToWaypoint = distanceBetween(position, waypoint);

    if (distanceToWaypoint <= remainingDistance) {
      position = waypoint;
      remainingDistance -= distanceToWaypoint;
      waypointIndex += 1;
      continue;
    }

    if (remainingDistance > 0 && distanceToWaypoint > 0) {
      const ratio = remainingDistance / distanceToWaypoint;
      position = {
        x: position.x + (waypoint.x - position.x) * ratio,
        y: position.y + (waypoint.y - position.y) * ratio,
      };
    }

    break;
  }

  const remainingWaypoints = state.remainingWaypoints.slice(waypointIndex);
  const didArrive = remainingWaypoints.length === 0;

  return {
    state: {
      position,
      remainingWaypoints,
      status: didArrive ? "idle" : "moving",
    },
    didArrive,
  };
}
