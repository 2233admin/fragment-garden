import type { CompanionAiMode, Settings } from "../domain";
import { createDefaultSettings } from "../domain/companion/settings";
import { SettingsRepository } from "../data/repositories/settings-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type AcceptOpenAiDisclosureInput = Readonly<{ now: string }>;

export async function acceptOpenAiDisclosure(
  input: AcceptOpenAiDisclosureInput,
  dependencies: LocalServiceDependencies = {},
): Promise<Settings> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const repository = new SettingsRepository(database);

  return database.transaction("rw", database.settings, async () => {
    const stored = await repository.get();
    if (stored?.openAiDisclosureAcceptedAt != null) {
      return {
        ...createDefaultSettings(),
        ...stored,
        companionAiMode: stored.companionAiMode === "openai" ? "openai" : "local",
        openAiDisclosureAcceptedAt: stored.openAiDisclosureAcceptedAt,
      };
    }

    const settings: Settings = {
      ...createDefaultSettings(),
      ...stored,
      openAiDisclosureAcceptedAt: timestamp,
      companionAiMode: "openai",
    };
    await repository.save(settings);
    return settings;
  });
}

export async function setCompanionAiMode(
  mode: CompanionAiMode,
  dependencies: LocalServiceDependencies = {},
): Promise<Settings> {
  if (mode !== "local" && mode !== "openai") {
    throw new Error("Unsupported companion AI mode");
  }

  const { database } = resolveLocalServiceDependencies(dependencies);
  const repository = new SettingsRepository(database);
  return database.transaction("rw", database.settings, async () => {
    const stored = await repository.get();
    if (mode === "openai" && stored?.openAiDisclosureAcceptedAt == null) {
      throw new Error("OpenAI disclosure must be accepted before enabling AI mode");
    }
    const settings: Settings = {
      ...createDefaultSettings(),
      ...stored,
      companionAiMode: mode,
      openAiDisclosureAcceptedAt: stored?.openAiDisclosureAcceptedAt ?? null,
    };
    await repository.save(settings);
    return settings;
  });
}
