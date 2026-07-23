import { createUuid, toIsoTimestamp, type Fragment } from "../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../data/db";

export const CURRENT_FRAGMENT_EVENT_RULE_VERSION = 1;

export type LocalServiceDependencies = {
  database?: FragmentGardenDatabase;
  createId?: () => string;
  now?: () => Date;
};

export type ResolvedLocalServiceDependencies = {
  database: FragmentGardenDatabase;
  createId: () => string;
  timestamp: string;
};

export function resolveLocalServiceDependencies(
  dependencies: LocalServiceDependencies,
): ResolvedLocalServiceDependencies {
  const now = dependencies.now ?? (() => new Date());

  return {
    database: dependencies.database ?? fragmentGardenDb,
    createId: dependencies.createId ?? createUuid,
    timestamp: toIsoTimestamp(now()),
  };
}

export function requireRecordUpdated(updatedRecordCount: number, entityName: string): void {
  if (updatedRecordCount !== 1) {
    throw new Error(`${entityName} could not be updated`);
  }
}

export function requireFragmentCanInteract(fragment: Fragment): void {
  if (fragment.lifecycleStatus === "deleted") {
    throw new Error(`Deleted fragment ${fragment.id} cannot be changed`);
  }
}
