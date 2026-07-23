import { createGridBounds } from "../../domain/movement/geometry";
import { GARDEN_MAP_HEIGHT, GARDEN_MAP_WIDTH } from "./garden-map";

export const MOVEMENT_GRID_SIZE = 32;
export const PLAYER_MOVE_SPEED = 160;
export const GARDEN_GRID_BOUNDS = Object.freeze(
  createGridBounds(GARDEN_MAP_WIDTH, GARDEN_MAP_HEIGHT, MOVEMENT_GRID_SIZE),
);
