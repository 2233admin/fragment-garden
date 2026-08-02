export type GardenGrowthStage = 0 | 1 | 2 | 3 | 4;
export type GardenZoneGrowthLevel = 0 | 1 | 2 | 3;

function normalizeCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

export function getGardenGrowthStage(plantCount: number): GardenGrowthStage {
  const normalizedCount = normalizeCount(plantCount);

  if (normalizedCount >= 28) {
    return 4;
  }

  if (normalizedCount >= 19) {
    return 3;
  }

  if (normalizedCount >= 10) {
    return 2;
  }

  if (normalizedCount >= 4) {
    return 1;
  }

  return 0;
}

export function getGardenZoneGrowthLevel(plantCount: number): GardenZoneGrowthLevel {
  const normalizedCount = normalizeCount(plantCount);

  if (normalizedCount >= 5) {
    return 3;
  }

  if (normalizedCount >= 3) {
    return 2;
  }

  if (normalizedCount >= 1) {
    return 1;
  }

  return 0;
}

export function getPreviewZoneGrowthLevel(gardenStage: GardenGrowthStage): GardenZoneGrowthLevel {
  switch (gardenStage) {
    case 0:
    case 1:
    case 2:
      return gardenStage;
    case 3:
    case 4:
      return 3;
  }
}
