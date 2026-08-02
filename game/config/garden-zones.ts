export const GARDEN_ZONE_IDS = Object.freeze([
  "greenhouse_front",
  "woodland",
  "center_left",
  "center_right",
  "pond",
  "entrance",
] as const);

export type GardenZoneId = (typeof GARDEN_ZONE_IDS)[number];

export type GardenZoneConfig = Readonly<{
  id: GardenZoneId;
  name: string;
  slotIds: readonly string[];
}>;

export const GARDEN_ZONE_CONFIGS: readonly GardenZoneConfig[] = Object.freeze([
  Object.freeze({
    id: "greenhouse_front",
    name: "花屋前主花坛",
    slotIds: Object.freeze(["slot-01", "slot-02", "slot-03", "slot-04", "slot-05", "slot-06"]),
  }),
  Object.freeze({
    id: "woodland",
    name: "左上林下花园",
    slotIds: Object.freeze(["slot-07", "slot-08", "slot-09", "slot-10", "slot-11", "slot-12"]),
  }),
  Object.freeze({
    id: "center_left",
    name: "中央左花坛",
    slotIds: Object.freeze(["slot-13", "slot-14", "slot-15", "slot-16", "slot-17", "slot-18"]),
  }),
  Object.freeze({
    id: "center_right",
    name: "中央右花坛",
    slotIds: Object.freeze(["slot-19", "slot-20", "slot-21", "slot-22", "slot-23", "slot-24"]),
  }),
  Object.freeze({
    id: "pond",
    name: "右上池塘花园",
    slotIds: Object.freeze(["slot-25", "slot-26", "slot-27", "slot-28", "slot-29", "slot-30"]),
  }),
  Object.freeze({
    id: "entrance",
    name: "入口与长椅花园",
    slotIds: Object.freeze(["slot-31", "slot-32", "slot-33", "slot-34", "slot-35", "slot-36"]),
  }),
]);

const ZONE_BY_SLOT_ID = new Map(
  GARDEN_ZONE_CONFIGS.flatMap((zone) => zone.slotIds.map((slotId) => [slotId, zone.id] as const)),
);

export function getGardenZoneIdForSlot(slotId: string | null): GardenZoneId | null {
  if (slotId === null) {
    return null;
  }

  return ZONE_BY_SLOT_ID.get(slotId) ?? null;
}
