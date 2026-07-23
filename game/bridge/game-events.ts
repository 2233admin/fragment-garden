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
    };
