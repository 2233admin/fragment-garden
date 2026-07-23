import type { Settings } from "../../domain";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";

const LOCAL_SETTINGS_ID: Settings["id"] = "local-user";

export class SettingsRepository {
  constructor(private readonly database: FragmentGardenDatabase = fragmentGardenDb) {}

  get(): Promise<Settings | undefined> {
    return this.database.settings.get(LOCAL_SETTINGS_ID);
  }

  save(settings: Settings): Promise<string> {
    return this.database.settings.put(settings);
  }
}
