import type Dexie from "dexie";
import type { Transaction } from "dexie";

import type { ChatMessage, Fragment, Plant, Settings } from "../domain";
import {
  FRAGMENT_GARDEN_DATABASE_VERSION_V2,
  FRAGMENT_GARDEN_DATABASE_VERSION_V3,
  FRAGMENT_GARDEN_DATABASE_VERSION_V4,
  FRAGMENT_GARDEN_SCHEMA_V3,
  FRAGMENT_GARDEN_SCHEMA_V4,
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

const DATABASE_MIGRATIONS: readonly MigrationRegistrar[] = [
  registerVersion2,
  registerVersion3,
  registerVersion4,
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
