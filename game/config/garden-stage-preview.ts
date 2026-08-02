import type { GardenGrowthStage } from "../../domain/garden/garden-growth";

const VALID_PREVIEW_STAGES = new Set(["0", "1", "2", "3", "4"]);

export function resolveGardenStagePreview(
  search: string,
  environment: string | undefined,
): GardenGrowthStage | null {
  if (environment !== "development") {
    return null;
  }

  const value = new URLSearchParams(search).get("gardenStage");

  if (value === null || !VALID_PREVIEW_STAGES.has(value)) {
    return null;
  }

  return Number(value) as GardenGrowthStage;
}
