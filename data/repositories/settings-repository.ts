import type { Settings } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

import { LOCAL_SETTINGS_ID } from "../../domain/companion/settings";

export type SettingsUpdate = Partial<Omit<Settings, "id">>;

export class SettingsRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  get(): Promise<Settings | undefined> {
    return this.database.settings.get(LOCAL_SETTINGS_ID);
  }

  save(settings: Settings): Promise<string> {
    return this.database.settings.put(settings);
  }

  update(changes: SettingsUpdate): Promise<number> {
    return this.database.settings.update(LOCAL_SETTINGS_ID, changes);
  }
}
