import type { PlantViewModel } from "../../domain/garden/plant-view-model";
import { PLANT_SLOT_CONFIGS } from "./garden-map";
import { GARDEN_ZONE_CONFIGS } from "./garden-zones";

export const CONTENT_PLANT_PREVIEW_MODES = Object.freeze([
  "overview",
  "stages",
  "states",
  "polished",
  "5",
  "18",
  "36",
] as const);

export type ContentPlantPreviewMode = (typeof CONTENT_PLANT_PREVIEW_MODES)[number];
export type ContentPlantPreviewVisualState = "hover" | "selected" | null;

const VALID_PREVIEW_MODES = new Set<string>(CONTENT_PLANT_PREVIEW_MODES);
const DENSITY_SPECIES = Object.freeze(["sunflower", "lavender", "dandelion"] as const);
const DENSITY_STAGES = Object.freeze([
  "seedling",
  "growing",
  "budding",
  "blooming",
  "permanent_bloom",
] as const);
const DENSITY_SLOT_IDS = Object.freeze({
  5: Object.freeze(["slot-03", "slot-09", "slot-15", "slot-21", "slot-27"]),
  18: Object.freeze(GARDEN_ZONE_CONFIGS.flatMap((zone) => zone.slotIds.slice(0, 3))),
  36: Object.freeze(PLANT_SLOT_CONFIGS.map((slot) => slot.id)),
} as const);

function createPreviewPlant(
  plantId: string,
  slotId: string,
  speciesId: PlantViewModel["speciesId"],
  stage: PlantViewModel["stage"],
  overrides: Partial<PlantViewModel> = {},
): PlantViewModel {
  return {
    plantId,
    fragmentId: `fragment-${plantId}`,
    slotId,
    title: plantId,
    speciesId,
    stage,
    vitality: "active",
    completionStatus: "open",
    ...overrides,
  };
}

function createDensityPreview(count: 5 | 18 | 36): readonly PlantViewModel[] {
  return Object.freeze(
    DENSITY_SLOT_IDS[count].map((slotId, index) => {
      const stage = DENSITY_STAGES[index % DENSITY_STAGES.length];
      const isPermanentBloom = stage === "permanent_bloom";
      const isDormant = index > 4 && index % 11 === 7;

      return createPreviewPlant(
        `content-preview-density-${index + 1}`,
        slotId,
        DENSITY_SPECIES[index % DENSITY_SPECIES.length],
        stage,
        {
          completionStatus: isPermanentBloom ? "completed" : "open",
          vitality: isDormant ? "dormant" : "active",
        },
      );
    }),
  );
}

const PREVIEW_PLANTS: Readonly<Record<ContentPlantPreviewMode, readonly PlantViewModel[]>> =
  Object.freeze({
    overview: Object.freeze([
      createPreviewPlant("content-preview-overview-warm", "slot-15", "sunflower", "blooming"),
      createPreviewPlant("content-preview-overview-cool", "slot-19", "lavender", "blooming"),
      createPreviewPlant(
        "content-preview-overview-soft",
        "slot-22",
        "dandelion",
        "permanent_bloom",
        { completionStatus: "completed" },
      ),
    ]),
    stages: Object.freeze([
      createPreviewPlant("content-preview-stage-seedling", "slot-13", "sunflower", "seedling"),
      createPreviewPlant("content-preview-stage-growing", "slot-14", "sunflower", "growing"),
      createPreviewPlant("content-preview-stage-budding", "slot-15", "sunflower", "budding"),
      createPreviewPlant("content-preview-stage-blooming", "slot-18", "sunflower", "blooming"),
      createPreviewPlant(
        "content-preview-stage-permanent",
        "slot-19",
        "sunflower",
        "permanent_bloom",
        { completionStatus: "completed" },
      ),
    ]),
    states: Object.freeze([
      createPreviewPlant("content-preview-state-normal", "slot-13", "sunflower", "blooming"),
      createPreviewPlant("content-preview-state-hover", "slot-15", "lavender", "blooming"),
      createPreviewPlant("content-preview-state-selected", "slot-18", "dandelion", "blooming"),
      createPreviewPlant("content-preview-state-dormant", "slot-19", "sunflower", "blooming", {
        vitality: "dormant",
      }),
      createPreviewPlant(
        "content-preview-state-permanent",
        "slot-22",
        "lavender",
        "permanent_bloom",
        { completionStatus: "completed" },
      ),
    ]),
    polished: Object.freeze([
      createPreviewPlant("content-preview-polished-warm-bloom", "slot-13", "sunflower", "blooming"),
      createPreviewPlant(
        "content-preview-polished-warm-permanent",
        "slot-14",
        "sunflower",
        "permanent_bloom",
        { completionStatus: "completed" },
      ),
      createPreviewPlant("content-preview-polished-cool-bloom", "slot-18", "lavender", "blooming"),
      createPreviewPlant(
        "content-preview-polished-cool-permanent",
        "slot-19",
        "lavender",
        "permanent_bloom",
        { completionStatus: "completed" },
      ),
      createPreviewPlant("content-preview-polished-soft-bloom", "slot-21", "dandelion", "blooming"),
      createPreviewPlant(
        "content-preview-polished-soft-permanent",
        "slot-22",
        "dandelion",
        "permanent_bloom",
        { completionStatus: "completed" },
      ),
    ]),
    "5": createDensityPreview(5),
    "18": createDensityPreview(18),
    "36": createDensityPreview(36),
  });

export function resolveContentPlantPreview(
  search: string,
  environment: string | undefined,
): ContentPlantPreviewMode | null {
  if (environment !== "development") {
    return null;
  }

  const value = new URLSearchParams(search).get("contentPlantPreview");

  if (value === null || !VALID_PREVIEW_MODES.has(value)) {
    return null;
  }

  return value as ContentPlantPreviewMode;
}

export function getContentPlantPreviewPlants(
  mode: ContentPlantPreviewMode,
): readonly PlantViewModel[] {
  return PREVIEW_PLANTS[mode];
}

export function getContentPlantPreviewVisualState(
  mode: ContentPlantPreviewMode | null,
  plantId: string,
): ContentPlantPreviewVisualState {
  if (mode === "36" && plantId === "content-preview-density-18") {
    return "selected";
  }

  if (mode === "states") {
    if (plantId === "content-preview-state-hover") {
      return "hover";
    }

    if (plantId === "content-preview-state-selected") {
      return "selected";
    }
  }

  return null;
}
