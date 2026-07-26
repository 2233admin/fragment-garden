import type Dexie from "dexie";
import type { Transaction } from "dexie";

import {
  plainTextToMarkdown,
  resolveFragmentContentMarkdown,
  type ChatMessage,
  type ExternalLinkImport,
  type Fragment,
  type FragmentEvent,
  type FragmentNote,
  type MediaAsset,
  type Plant,
  type Settings,
} from "../domain";
import { safelyParseTextAddedEventPayload } from "../validation/fragment-event-payload";
import {
  FRAGMENT_GARDEN_DATABASE_VERSION_V2,
  FRAGMENT_GARDEN_DATABASE_VERSION_V3,
  FRAGMENT_GARDEN_DATABASE_VERSION_V4,
  FRAGMENT_GARDEN_DATABASE_VERSION_V5,
  FRAGMENT_GARDEN_SCHEMA_V3,
  FRAGMENT_GARDEN_SCHEMA_V4,
  FRAGMENT_GARDEN_SCHEMA_V5,
} from "./schema";

type MigrationRegistrar = (database: Dexie) => void;

async function releaseRetiredFragmentPlantSlots(transaction: Transaction): Promise<void> {
  const retiredFragmentIds = await transaction
    .table<Fragment, string>("fragments")
    .where("lifecycleStatus")
    .anyOf(["archived", "deleted"])
    .primaryKeys();

  if (retiredFragmentIds.length === 0) {
    return;
  }

  await transaction
    .table<Plant, string>("plants")
    .where("fragmentId")
    .anyOf(retiredFragmentIds)
    .modify({ slotId: null });
}

const registerVersion2: MigrationRegistrar = (database) => {
  database
    .version(FRAGMENT_GARDEN_DATABASE_VERSION_V2)
    .stores({})
    .upgrade(releaseRetiredFragmentPlantSlots);
};

type Version2Settings = Omit<Settings, "getNoteDisclosureAcceptedAt"> & {
  getNoteDisclosureAcceptedAt?: string | null;
};

type Version2ChatMessage = Omit<ChatMessage, "fragmentId"> & {
  fragmentId?: string | null;
};

async function addVersion3RecordFields(transaction: Transaction): Promise<void> {
  await Promise.all([
    transaction
      .table<Version2Settings, string>("settings")
      .toCollection()
      .modify((settings) => {
        if (settings.getNoteDisclosureAcceptedAt === undefined) {
          settings.getNoteDisclosureAcceptedAt = null;
        }
      }),
    transaction
      .table<Version2ChatMessage, string>("chatMessages")
      .toCollection()
      .modify((message) => {
        if (message.fragmentId === undefined) {
          message.fragmentId = null;
        }
      }),
  ]);
}

const registerVersion3: MigrationRegistrar = (database) => {
  database
    .version(FRAGMENT_GARDEN_DATABASE_VERSION_V3)
    .stores(FRAGMENT_GARDEN_SCHEMA_V3)
    .upgrade(addVersion3RecordFields);
};

/** V4 only adds the local media table; all existing V3 records stay untouched. */
const registerVersion4: MigrationRegistrar = (database) => {
  database.version(FRAGMENT_GARDEN_DATABASE_VERSION_V4).stores(FRAGMENT_GARDEN_SCHEMA_V4);
};

type Version4Fragment = Omit<Fragment, "contentMarkdown"> & {
  contentMarkdown?: string;
};

async function addVersion5Content(transaction: Transaction): Promise<void> {
  const [legacyFragments, linkImports, mediaAssets, textAddedEvents] = await Promise.all([
    transaction.table<Version4Fragment, string>("fragments").toArray(),
    transaction.table<ExternalLinkImport, string>("externalLinkImports").toArray(),
    transaction.table<MediaAsset, string>("mediaAssets").toArray(),
    transaction
      .table<FragmentEvent, string>("fragmentEvents")
      .where("type")
      .equals("text_added")
      .toArray(),
  ]);

  const linkImportByFragmentId = new Map(
    linkImports.map((linkImport) => [linkImport.fragmentId, linkImport] as const),
  );
  const mediaAssetByFragmentId = new Map(
    mediaAssets.map((mediaAsset) => [mediaAsset.fragmentId, mediaAsset] as const),
  );
  const fragmentIds = new Set(legacyFragments.map((fragment) => fragment.id));
  const migratedFragments: Fragment[] = legacyFragments.map((legacyFragment) => {
    return {
      ...legacyFragment,
      contentMarkdown: resolveFragmentContentMarkdown(
        legacyFragment,
        linkImportByFragmentId.get(legacyFragment.id) ?? null,
        mediaAssetByFragmentId.get(legacyFragment.id) ?? null,
      ),
    };
  });
  const notes: FragmentNote[] = textAddedEvents.flatMap((event) => {
    if (!fragmentIds.has(event.fragmentId)) return [];
    const payload = safelyParseTextAddedEventPayload(event.payload);
    if (payload === null) return [];
    const contentMarkdown = plainTextToMarkdown(payload.text);
    if (contentMarkdown.length === 0) return [];
    return [
      {
        id: event.id,
        fragmentId: event.fragmentId,
        contentMarkdown,
        source: "user" as const,
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
      },
    ];
  });

  await transaction.table<Fragment, string>("fragments").bulkPut(migratedFragments);
  if (notes.length > 0) {
    await transaction.table<FragmentNote, string>("fragmentNotes").bulkPut(notes);
  }
}

const registerVersion5: MigrationRegistrar = (database) => {
  database
    .version(FRAGMENT_GARDEN_DATABASE_VERSION_V5)
    .stores(FRAGMENT_GARDEN_SCHEMA_V5)
    .upgrade(addVersion5Content);
};

const DATABASE_MIGRATIONS: readonly MigrationRegistrar[] = [
  registerVersion2,
  registerVersion3,
  registerVersion4,
  registerVersion5,
];

/**
 * Version 1 is the initial schema. Later versions are registered in order and
 * inherit the previous schema unless a migration explicitly declares stores.
 */
export function registerDatabaseMigrations(database: Dexie): void {
  for (const registerMigration of DATABASE_MIGRATIONS) {
    registerMigration(database);
  }
}
