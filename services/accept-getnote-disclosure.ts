import type { Settings } from "../domain/shared/types";
import { createDefaultSettings } from "../domain/companion/settings";
import { SettingsRepository } from "../data/repositories/settings-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AcceptGetNoteDisclosureInput = Readonly<{
  now: string;
}>;

export async function acceptGetNoteDisclosure(
  input: AcceptGetNoteDisclosureInput,
  dependencies: LocalServiceDependencies = {},
): Promise<Settings> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const settingsRepository = new SettingsRepository(database);

  return database.transaction("rw", database.settings, async () => {
    const storedSettings = await settingsRepository.get();

    if (storedSettings?.getNoteDisclosureAcceptedAt != null) {
      return storedSettings;
    }

    const settings: Settings = {
      ...(storedSettings ?? createDefaultSettings()),
      getNoteDisclosureAcceptedAt: timestamp,
    };

    await settingsRepository.save(settings);
    return settings;
  });
}
