import type { Settings } from "../domain/shared/types";
import { createDefaultSettings } from "../domain/companion/settings";
import { SettingsRepository } from "../data/repositories/settings-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AcceptSproutDisclosureInput = Readonly<{
  now: string;
}>;

export async function acceptSproutDisclosure(
  input: AcceptSproutDisclosureInput,
  dependencies: LocalServiceDependencies = {},
): Promise<Settings> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new SettingsRepository(database);

  return database.transaction("rw", database.settings, async () => {
    const stored = await repository.get();
    if (stored?.sproutAiDisclosureAcceptedAt != null) {
      return {
        ...createDefaultSettings(),
        ...stored,
        sproutAiDisclosureAcceptedAt: stored.sproutAiDisclosureAcceptedAt,
      };
    }

    const settings: Settings = {
      ...createDefaultSettings(),
      ...stored,
      sproutAiDisclosureAcceptedAt: timestamp,
    };
    await repository.save(settings);
    return settings;
  });
}
