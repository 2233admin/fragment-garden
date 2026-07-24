import type { Settings } from "../shared/types";

export const LOCAL_SETTINGS_ID: Settings["id"] = "local-user";

export function createDefaultSettings(): Settings {
  return {
    id: LOCAL_SETTINGS_ID,
    onboardingCompleted: false,
    companionType: null,
    lastOpenedAt: null,
    lastRecommendationDate: null,
    getNoteDisclosureAcceptedAt: null,
    openAiDisclosureAcceptedAt: null,
    companionAiMode: "local",
    schemaVersion: 1,
  };
}
