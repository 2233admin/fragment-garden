import type { PlantViewModel } from "../../domain/garden/plant-view-model";

export type ReactToGameEvent =
  | {
      type: "LOAD_GARDEN";
      plants: PlantViewModel[];
    }
  | {
      type: "ADD_PLANT";
      plant: PlantViewModel;
    }
  | {
      type: "UPDATE_PLANT";
      plant: PlantViewModel;
    }
  | {
      type: "REMOVE_PLANT";
      plantId: string;
    }
  | {
      type: "CANCEL_INTERACTION";
    };

export type MovementFailureReason = "target_blocked" | "path_not_found" | "plant_unavailable";

export type GameToReactEvent =
  | {
      type: "PLAYER_STATE_CHANGED";
      playerX: number;
      playerY: number;
      movementState: "idle" | "moving";
      selectedPlantId: string | null;
    }
  | {
      type: "MOVEMENT_STARTED";
      targetType: "ground" | "plant";
      targetId?: string;
    }
  | {
      type: "PLAYER_REACHED_PLANT";
      plantId: string;
    }
  | {
      type: "MOVEMENT_FAILED";
      reason: MovementFailureReason;
      targetId?: string;
    };

export type GardenInteractionEvent = Exclude<GameToReactEvent, { type: "PLAYER_STATE_CHANGED" }>;
