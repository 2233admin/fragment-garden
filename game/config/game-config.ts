import type { PlantStage } from "../../domain/shared/types";

export const BOOT_SCENE_KEY = "BootScene";
export const GARDEN_SCENE_KEY = "GardenScene";
export const PLAYER_TEXTURE_KEY = "garden-player-placeholder";

export const PLANT_TEXTURE_KEYS: Readonly<Record<PlantStage, string>> = Object.freeze({
  seedling: "garden-plant-seedling",
  growing: "garden-plant-growing",
  budding: "garden-plant-budding",
  blooming: "garden-plant-blooming",
  permanent_bloom: "garden-plant-permanent-bloom",
});

export const GARDEN_RENDER_COLORS = Object.freeze({
  background: 0xdce9df,
  grass: 0xc9dec9,
  grassShade: 0xb8d3bc,
  border: 0x6f9478,
  path: 0xd8c7a5,
  pathEdge: 0xb7a17c,
  pond: 0x91bac0,
  pondEdge: 0x6e9da5,
  soil: 0xa78262,
  soilEdge: 0x86664e,
  stem: 0x3f7652,
  leaf: 0x5e9565,
  leafShade: 0x477b52,
  bud: 0xd7a66f,
  bloom: 0xd57c80,
  permanentBloom: 0xf0c55e,
  playerClothing: 0x486b67,
  playerSkin: 0xe5bea0,
  playerOutline: 0x294842,
  movementTarget: 0xf0c55e,
  movementFailure: 0xb75d52,
  selection: 0xf0c55e,
  hedge: 0x557b59,
  hedgeShade: 0x3f6548,
  companionCat: 0x718b79,
  companionDog: 0xb78a62,
  companionAccent: 0xf3e5ca,
  companionOutline: 0x324b41,
  companionHover: 0xf0c55e,
});
