export const GARDEN_FEATURE_IDS = ["house", "backup"] as const;

export type GardenFeatureId = (typeof GARDEN_FEATURE_IDS)[number];

export type GardenFeatureHotspotConfig = Readonly<{
  id: GardenFeatureId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const GARDEN_FEATURE_HOTSPOTS: Readonly<
  Record<GardenFeatureId, GardenFeatureHotspotConfig>
> = Object.freeze({
  house: Object.freeze({
    id: "house",
    label: "进入小屋",
    x: 464,
    y: 78,
    width: 122,
    height: 132,
  }),
  backup: Object.freeze({
    id: "backup",
    label: "整理备份",
    x: 160,
    y: 482,
    width: 50,
    height: 46,
  }),
});

export const CARD_MODE_ENTRY_DELAY_MS = 2_000;
export const GARDEN_MODE_ENTRY_DELAY_MS = 2_000;
