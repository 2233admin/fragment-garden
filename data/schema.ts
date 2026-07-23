export const FRAGMENT_GARDEN_DATABASE_NAME = "fragment-garden";

export const FRAGMENT_GARDEN_DATABASE_VERSION_V1 = 1;
export const FRAGMENT_GARDEN_DATABASE_VERSION_V2 = 2;
export const FRAGMENT_GARDEN_DATABASE_VERSION = FRAGMENT_GARDEN_DATABASE_VERSION_V2;

export const FRAGMENT_GARDEN_SCHEMA_V1 = {
  settings: "id",
  fragments: "id,lifecycleStatus,completionStatus,contentType,createdAt,lastInteractedAt",
  attachments: "id,fragmentId",
  fragmentEvents: "id,fragmentId,type,occurredAt",
  plants: "id,fragmentId,slotId,stage,vitality",
  relations: "id,sourceFragmentId,targetFragmentId,status",
  clusters: "id",
  recommendations: "id,fragmentId,shownAt",
  chatMessages: "id,createdAt",
} as const;
