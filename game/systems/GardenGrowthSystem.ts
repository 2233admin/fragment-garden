import {
  getGardenGrowthStage,
  getGardenZoneGrowthLevel,
  getPreviewZoneGrowthLevel,
  type GardenGrowthStage,
  type GardenZoneGrowthLevel,
} from "../../domain/garden/garden-growth";
import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import { GARDEN_ZONE_IDS, getGardenZoneIdForSlot, type GardenZoneId } from "../config/garden-zones";
import {
  GLOBAL_GARDEN_GROWTH_LAYER_NAMES,
  type GardenGrowthLayerName,
} from "../config/tiled-garden-map";

export type GardenGrowthLayerController = Readonly<{
  setVisible: (isVisible: boolean) => unknown;
}>;

export type GardenGrowthSnapshot = Readonly<{
  globalStage: GardenGrowthStage;
  zoneLevels: Readonly<Record<GardenZoneId, GardenZoneGrowthLevel>>;
}>;

function createEmptyZoneCounts(): Record<GardenZoneId, number> {
  return {
    greenhouse_front: 0,
    woodland: 0,
    center_left: 0,
    center_right: 0,
    pond: 0,
    entrance: 0,
  };
}

function createZoneLevels(
  plants: readonly PlantViewModel[],
  previewStage: GardenGrowthStage | null,
): Record<GardenZoneId, GardenZoneGrowthLevel> {
  if (previewStage !== null) {
    const previewLevel = getPreviewZoneGrowthLevel(previewStage);
    return {
      greenhouse_front: previewLevel,
      woodland: previewLevel,
      center_left: previewLevel,
      center_right: previewLevel,
      pond: previewLevel,
      entrance: previewLevel,
    };
  }

  const counts = createEmptyZoneCounts();

  for (const plant of plants) {
    const zoneId = getGardenZoneIdForSlot(plant.slotId);

    if (zoneId !== null) {
      counts[zoneId] += 1;
    }
  }

  return {
    greenhouse_front: getGardenZoneGrowthLevel(counts.greenhouse_front),
    woodland: getGardenZoneGrowthLevel(counts.woodland),
    center_left: getGardenZoneGrowthLevel(counts.center_left),
    center_right: getGardenZoneGrowthLevel(counts.center_right),
    pond: getGardenZoneGrowthLevel(counts.pond),
    entrance: getGardenZoneGrowthLevel(counts.entrance),
  };
}

export class GardenGrowthSystem {
  private snapshot: GardenGrowthSnapshot = {
    globalStage: 0,
    zoneLevels: createZoneLevels([], 0),
  };

  constructor(
    private readonly layers: ReadonlyMap<GardenGrowthLayerName, GardenGrowthLayerController>,
    private readonly previewStage: GardenGrowthStage | null,
  ) {}

  update(plants: readonly PlantViewModel[]): GardenGrowthSnapshot {
    const globalStage =
      this.previewStage ??
      getGardenGrowthStage(plants.filter((plant) => plant.slotId !== null).length);
    const zoneLevels = createZoneLevels(plants, this.previewStage);

    GLOBAL_GARDEN_GROWTH_LAYER_NAMES.forEach((layerName, index) => {
      this.layers.get(layerName)?.setVisible(globalStage >= index + 1);
    });

    for (const zoneId of GARDEN_ZONE_IDS) {
      const level = zoneLevels[zoneId];

      for (const candidateLevel of [1, 2, 3] as const) {
        const layerName = `Zone_${zoneId}_Growth${candidateLevel}` as GardenGrowthLayerName;
        this.layers.get(layerName)?.setVisible(level >= candidateLevel);
      }
    }

    this.snapshot = Object.freeze({
      globalStage,
      zoneLevels: Object.freeze({ ...zoneLevels }),
    });

    return this.snapshot;
  }

  getSnapshot(): GardenGrowthSnapshot {
    return this.snapshot;
  }
}
