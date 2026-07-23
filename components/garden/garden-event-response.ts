import type { PlantViewModel } from "@/domain";
import type { GardenInteractionEvent } from "@/game/bridge/game-events";

export type GardenEventResponse =
  | Readonly<{
      type: "status";
      message: string;
    }>
  | Readonly<{
      type: "error";
      message: string;
    }>
  | Readonly<{
      type: "open_fragment";
      fragmentId: string;
      plantId: string;
      successMessage?: string;
    }>;

const MISSING_PLANT_MESSAGE = "这株植物已不在当前花园中，没有打开其他碎片。";
const PLANT_MOVEMENT_FALLBACK_MESSAGE = "暂时无法走到这株植物，已直接为你打开内容。";

function findPlant(plants: readonly PlantViewModel[], plantId: string): PlantViewModel | undefined {
  return plants.find((plant) => plant.plantId === plantId);
}

export function resolveGardenEventResponse(
  event: GardenInteractionEvent,
  plants: readonly PlantViewModel[],
): GardenEventResponse {
  if (event.type === "MOVEMENT_STARTED") {
    return {
      type: "status",
      message:
        event.targetType === "plant"
          ? "已选择这株植物，人物会走近后打开内容。"
          : "已选择移动目标，人物会沿可行走路线前往。",
    };
  }

  if (event.type === "PLAYER_REACHED_PLANT") {
    const plant = findPlant(plants, event.plantId);

    return plant === undefined
      ? { type: "error", message: MISSING_PLANT_MESSAGE }
      : {
          type: "open_fragment",
          fragmentId: plant.fragmentId,
          plantId: plant.plantId,
        };
  }

  if (event.targetId !== undefined) {
    const plant = findPlant(plants, event.targetId);

    return plant === undefined
      ? { type: "error", message: MISSING_PLANT_MESSAGE }
      : {
          type: "open_fragment",
          fragmentId: plant.fragmentId,
          plantId: plant.plantId,
          successMessage: PLANT_MOVEMENT_FALLBACK_MESSAGE,
        };
  }

  return {
    type: "error",
    message:
      event.reason === "target_blocked"
        ? "这里暂时不能通行，请换一块草地或道路。"
        : "暂时找不到去那里的路线，请换一个位置。",
  };
}
