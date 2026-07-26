import Dexie, { type Table } from "dexie";

import type {
  Attachment,
  ChatMessage,
  Cluster,
  ContentProcessingJob,
  ExternalLinkImport,
  Fragment,
  FragmentEvent,
  FragmentNote,
  FragmentRelation,
  MediaAsset,
  Plant,
  Recommendation,
  Settings,
} from "../domain";
import { registerDatabaseMigrations } from "./migrations";
import {
  FRAGMENT_GARDEN_DATABASE_NAME,
  FRAGMENT_GARDEN_DATABASE_VERSION_V1,
  FRAGMENT_GARDEN_SCHEMA_V1,
} from "./schema";

export class FragmentGardenDatabase extends Dexie {
  settings!: Table<Settings, string>;
  fragments!: Table<Fragment, string>;
  attachments!: Table<Attachment, string>;
  fragmentEvents!: Table<FragmentEvent, string>;
  plants!: Table<Plant, string>;
  relations!: Table<FragmentRelation, string>;
  clusters!: Table<Cluster, string>;
  recommendations!: Table<Recommendation, string>;
  chatMessages!: Table<ChatMessage, string>;
  externalLinkImports!: Table<ExternalLinkImport, string>;
  mediaAssets!: Table<MediaAsset, string>;
  fragmentNotes!: Table<FragmentNote, string>;
  contentProcessingJobs!: Table<ContentProcessingJob, string>;

  constructor(databaseName = FRAGMENT_GARDEN_DATABASE_NAME) {
    super(databaseName);

    this.version(FRAGMENT_GARDEN_DATABASE_VERSION_V1).stores(FRAGMENT_GARDEN_SCHEMA_V1);
    registerDatabaseMigrations(this);
  }
}

export const fragmentGardenDb = new FragmentGardenDatabase();
