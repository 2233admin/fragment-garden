import type Dexie from "dexie";

type MigrationRegistrar = (database: Dexie) => void;

const FUTURE_MIGRATIONS: readonly MigrationRegistrar[] = [];

/**
 * Version 1 is the initial schema, so there is no historical data to migrate.
 * Register version 2 and later migrations here when they exist.
 */
export function registerDatabaseMigrations(database: Dexie): void {
  for (const registerMigration of FUTURE_MIGRATIONS) {
    registerMigration(database);
  }
}
