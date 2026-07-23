import type { ChatMessage, CompanionType, Settings } from "../domain/shared/types";
import { createDefaultSettings } from "../domain/companion/settings";
import { ChatMessageRepository } from "../data/repositories/chat-message-repository";
import { SettingsRepository } from "../data/repositories/settings-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export const COMPANION_WELCOME_MESSAGE =
  "以后我会陪你照看这座花园。你可以随时来记录想法，也可以让我带你看看以前种下的内容。";

export type CompleteCompanionOnboardingInput = Readonly<{
  companionType: CompanionType;
  now: string;
}>;

export type CompleteCompanionOnboardingResult = Readonly<{
  settings: Settings;
  welcomeMessage: ChatMessage | null;
}>;

export async function completeCompanionOnboarding(
  input: CompleteCompanionOnboardingInput,
  dependencies: LocalServiceDependencies = {},
): Promise<CompleteCompanionOnboardingResult> {
  if (input.companionType !== "cat" && input.companionType !== "dog") {
    throw new Error("A cat or dog companion must be selected");
  }

  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const settingsRepository = new SettingsRepository(database);
  const chatMessageRepository = new ChatMessageRepository(database);

  return database.transaction("rw", database.settings, database.chatMessages, async () => {
    const storedSettings = await settingsRepository.get();

    if (
      storedSettings?.onboardingCompleted === true &&
      storedSettings.companionType !== input.companionType
    ) {
      throw new Error("The garden companion cannot be changed after onboarding");
    }

    const settings: Settings =
      storedSettings?.onboardingCompleted === true
        ? storedSettings
        : {
            ...(storedSettings ?? createDefaultSettings()),
            onboardingCompleted: true,
            companionType: input.companionType,
          };

    if (storedSettings?.onboardingCompleted !== true) {
      await settingsRepository.save(settings);
    }

    const existingMessages = await chatMessageRepository.list();
    const alreadyHasWelcomeMessage = existingMessages.some(
      (message) => message.role === "assistant" && message.content === COMPANION_WELCOME_MESSAGE,
    );
    const welcomeMessage: ChatMessage | null = alreadyHasWelcomeMessage
      ? null
      : {
          id: createId(),
          fragmentId: null,
          role: "assistant",
          content: COMPANION_WELCOME_MESSAGE,
          createdAt: timestamp,
        };

    if (welcomeMessage !== null) {
      await chatMessageRepository.add(welcomeMessage);
    }

    return { settings, welcomeMessage };
  });
}
