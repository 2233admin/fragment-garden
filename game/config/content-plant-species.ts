import type { PlantSpeciesId, PlantStage, PlantVitality } from "../../domain/shared/types";
import type { PlantViewModel } from "../../domain/garden/plant-view-model";

export const CONTENT_PLANT_TEXTURE_KEY = "garden-content-plants";
export const CONTENT_PLANT_SHADOW_TEXTURE_KEY = "garden-content-plant-shadow";
export const CONTENT_PLANT_FALLBACK_SHADOW_TEXTURE_KEY = "garden-content-plant-shadow-fallback";

export const CONTENT_PLANT_ASSET = Object.freeze({
  key: CONTENT_PLANT_TEXTURE_KEY,
  path: "/assets/garden/plants/content-plants.png",
  frameWidth: 64,
  frameHeight: 80,
});

export const CONTENT_PLANT_SHADOW_ASSET = Object.freeze({
  key: CONTENT_PLANT_SHADOW_TEXTURE_KEY,
  path: "/assets/garden/plants/content-plant-shadow.png",
});

export const CONTENT_PLANT_STAGES = Object.freeze([
  "seedling",
  "growing",
  "budding",
  "blooming",
  "permanent_bloom",
] as const satisfies readonly PlantStage[]);

export const CONTENT_PLANT_SPECIES_IDS = Object.freeze([
  "sunflower",
  "lavender",
  "dandelion",
] as const satisfies readonly PlantSpeciesId[]);

export type ContentPlantSpeciesId = (typeof CONTENT_PLANT_SPECIES_IDS)[number];

export type ContentPlantDisplaySize = Readonly<{
  width: number;
  height: number;
}>;

export type ContentPlantHitArea = Readonly<{
  width: number;
  height: number;
  offsetY: number;
}>;

export type ContentPlantSpeciesConfig = Readonly<{
  id: ContentPlantSpeciesId;
  displayName: string;
  row: number;
  frames: Readonly<Record<PlantStage, number>>;
  displaySize: Readonly<Record<PlantStage, ContentPlantDisplaySize>>;
  hitArea: ContentPlantHitArea;
  shadowScale: number;
  dormantTint: number;
}>;

const STAGE_COLUMN: Readonly<Record<PlantStage, number>> = Object.freeze({
  seedling: 0,
  growing: 1,
  budding: 2,
  blooming: 3,
  permanent_bloom: 4,
});

function createSpeciesConfig(
  id: ContentPlantSpeciesId,
  displayName: string,
  row: number,
  displaySize: Readonly<Record<PlantStage, ContentPlantDisplaySize>>,
  hitArea: ContentPlantHitArea,
  shadowScale: number,
): ContentPlantSpeciesConfig {
  const rowStart = row * CONTENT_PLANT_STAGES.length;

  return Object.freeze({
    id,
    displayName,
    row,
    displaySize,
    hitArea,
    shadowScale,
    dormantTint: 0xa8b2aa,
    frames: Object.freeze({
      seedling: rowStart + STAGE_COLUMN.seedling,
      growing: rowStart + STAGE_COLUMN.growing,
      budding: rowStart + STAGE_COLUMN.budding,
      blooming: rowStart + STAGE_COLUMN.blooming,
      permanent_bloom: rowStart + STAGE_COLUMN.permanent_bloom,
    }),
  });
}

export const CONTENT_PLANT_SPECIES_CONFIGS: Readonly<
  Record<ContentPlantSpeciesId, ContentPlantSpeciesConfig>
> = Object.freeze({
  sunflower: createSpeciesConfig(
    "sunflower",
    "暖阳花",
    0,
    Object.freeze({
      seedling: Object.freeze({ width: 36, height: 24 }),
      growing: Object.freeze({ width: 28, height: 32 }),
      budding: Object.freeze({ width: 32, height: 48 }),
      blooming: Object.freeze({ width: 42, height: 58 }),
      permanent_bloom: Object.freeze({ width: 50, height: 64 }),
    }),
    Object.freeze({ width: 58, height: 64, offsetY: 0 }),
    1.05,
  ),
  lavender: createSpeciesConfig(
    "lavender",
    "蓝紫绒球花",
    1,
    Object.freeze({
      seedling: Object.freeze({ width: 20, height: 22 }),
      growing: Object.freeze({ width: 24, height: 34 }),
      budding: Object.freeze({ width: 30, height: 44 }),
      blooming: Object.freeze({ width: 38, height: 56 }),
      permanent_bloom: Object.freeze({ width: 52, height: 64 }),
    }),
    Object.freeze({ width: 58, height: 64, offsetY: 0 }),
    1,
  ),
  dandelion: createSpeciesConfig(
    "dandelion",
    "粉白星花",
    2,
    Object.freeze({
      seedling: Object.freeze({ width: 20, height: 22 }),
      growing: Object.freeze({ width: 24, height: 34 }),
      budding: Object.freeze({ width: 32, height: 44 }),
      blooming: Object.freeze({ width: 44, height: 58 }),
      permanent_bloom: Object.freeze({ width: 56, height: 64 }),
    }),
    Object.freeze({ width: 60, height: 64, offsetY: 0 }),
    1.1,
  ),
});

const RECOGNIZED_SPECIES = new Set<PlantSpeciesId>(CONTENT_PLANT_SPECIES_IDS);

export function hashPlantId(plantId: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < plantId.length; index += 1) {
    hash ^= plantId.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

export function resolveContentPlantSpecies(
  plant: Pick<PlantViewModel, "plantId" | "speciesId">,
): ContentPlantSpeciesId {
  if (plant.speciesId !== null && RECOGNIZED_SPECIES.has(plant.speciesId)) {
    return plant.speciesId as ContentPlantSpeciesId;
  }

  return CONTENT_PLANT_SPECIES_IDS[hashPlantId(plant.plantId) % CONTENT_PLANT_SPECIES_IDS.length];
}

export function resolveContentPlantStage(
  plant: Pick<PlantViewModel, "completionStatus" | "stage">,
): PlantStage {
  return plant.completionStatus === "completed" ? "permanent_bloom" : plant.stage;
}

export function resolveContentPlantFrame(
  plant: Pick<PlantViewModel, "completionStatus" | "plantId" | "speciesId" | "stage">,
): number {
  const species = resolveContentPlantSpecies(plant);
  const stage = resolveContentPlantStage(plant);
  return CONTENT_PLANT_SPECIES_CONFIGS[species].frames[stage];
}

export function resolveContentPlantSpeciesConfig(
  plant: Pick<PlantViewModel, "plantId" | "speciesId">,
): ContentPlantSpeciesConfig {
  return CONTENT_PLANT_SPECIES_CONFIGS[resolveContentPlantSpecies(plant)];
}

export function resolveContentPlantDisplaySize(
  plant: Pick<PlantViewModel, "completionStatus" | "plantId" | "speciesId" | "stage">,
): ContentPlantDisplaySize {
  const config = resolveContentPlantSpeciesConfig(plant);
  return config.displaySize[resolveContentPlantStage(plant)];
}

export type ContentPlantAppearance = Readonly<{
  alpha: number;
  idleMotionEnabled: boolean;
  tint: number | null;
}>;

export function resolveContentPlantAppearance(
  vitality: PlantVitality,
  isReducedMotion: boolean,
  dormantTint = 0xa8b2aa,
): ContentPlantAppearance {
  if (vitality === "dormant") {
    return Object.freeze({
      alpha: 0.9,
      idleMotionEnabled: false,
      tint: dormantTint,
    });
  }

  return Object.freeze({
    alpha: 1,
    idleMotionEnabled: !isReducedMotion,
    tint: null,
  });
}

export type ContentPlantTextureSource = "content" | "fallback";

export function resolveContentPlantTextureSource(
  hasContentPlantTexture: boolean,
): ContentPlantTextureSource {
  return hasContentPlantTexture ? "content" : "fallback";
}
