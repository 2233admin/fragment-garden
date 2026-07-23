import type Dexie from "dexie";
import type { Transaction } from "dexie";

import type { Fragment, Plant } from "../domain";
import { FRAGMENT_GARDEN_DATABASE_VERSION_V2 } from "./schema";

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

const DATABASE_MIGRATIONS: readonly MigrationRegistrar[] = [registerVersion2];

/**
 * Version 1 is the initial schema. Later versions are registered in order and
 * inherit the previous schema unless a migration explicitly declares stores.
 */
export function registerDatabaseMigrations(database: Dexie): void {
  for (const registerMigration of DATABASE_MIGRATIONS) {
    registerMigration(database);
  }
}
