export const FRAGMENT_GARDEN_DATABASE_NAME = "fragment-garden";

export const FRAGMENT_GARDEN_DATABASE_VERSION_V1 = 1;
export const FRAGMENT_GARDEN_DATABASE_VERSION_V2 = 2;
export const FRAGMENT_GARDEN_DATABASE_VERSION_V3 = 3;
export const FRAGMENT_GARDEN_DATABASE_VERSION_V4 = 4;
export const FRAGMENT_GARDEN_DATABASE_VERSION_V5 = 5;
export const FRAGMENT_GARDEN_DATABASE_VERSION = FRAGMENT_GARDEN_DATABASE_VERSION_V5;

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

export const FRAGMENT_GARDEN_SCHEMA_V3 = {
  externalLinkImports: "id,&fragmentId,normalizedUrl,status,taskId,externalNoteId,createdAt",
} as const;

export const FRAGMENT_GARDEN_SCHEMA_V4 = {
  mediaAssets: "id,fragmentId,kind,processingStatus,createdAt",
} as const;

/** Both stores are declared together; later stages may use jobs without mutating V5. */
export const FRAGMENT_GARDEN_SCHEMA_V5 = {
  fragmentNotes: "id,fragmentId,source,createdAt,updatedAt",
  contentProcessingJobs: "id,kind,status,createdAt,updatedAt,sourceFragmentId,createdFragmentId",
} as const;
