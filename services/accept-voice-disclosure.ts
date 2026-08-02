import type { Settings } from "../domain/shared/types";
import { createDefaultSettings } from "../domain/companion/settings";
import { SettingsRepository } from "../data/repositories/settings-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AcceptVoiceDisclosureInput = Readonly<{ now: string }>;

/** Persists voice consent separately from the legacy chatbot and sprout consents. */
export async function acceptVoiceDisclosure(
  input: AcceptVoiceDisclosureInput,
  dependencies: LocalServiceDependencies = {},
): Promise<Settings> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new SettingsRepository(database);

  return database.transaction("rw", database.settings, async () => {
    const stored = await repository.get();
    if (stored?.voiceAiDisclosureAcceptedAt != null) {
      return { ...createDefaultSettings(), ...stored };
    }

    const settings: Settings = {
      ...createDefaultSettings(),
      ...stored,
      voiceAiDisclosureAcceptedAt: timestamp,
    };
    await repository.save(settings);
    return settings;
  });
}
