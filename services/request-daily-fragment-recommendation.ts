import type { Settings } from "../domain/shared/types";
import { toLocalDateKey } from "../domain/recommendations/select-fragment-recommendation";
import { SettingsRepository } from "../data/repositories/settings-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";
import {
  requestFragmentRecommendation,
  type FragmentRecommendationResult,
} from "./request-fragment-recommendation";

export type RequestDailyFragmentRecommendationInput = Readonly<{
  now: string;
}>;

export type DailyFragmentRecommendationResult = Readonly<{
  settings: Settings;
  recommendation: FragmentRecommendationResult;
}>;

export async function requestDailyFragmentRecommendation(
  input: RequestDailyFragmentRecommendationInput,
  dependencies: LocalServiceDependencies = {},
): Promise<DailyFragmentRecommendationResult | null> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const settingsRepository = new SettingsRepository(database);
  const localDate = toLocalDateKey(timestamp);

  return database.transaction(
    "rw",
    database.settings,
    database.fragments,
    database.recommendations,
    async () => {
      const settings = await settingsRepository.get();

      if (
        settings === undefined ||
        !settings.onboardingCompleted ||
        settings.companionType === null ||
        settings.lastRecommendationDate === localDate
      ) {
        return null;
      }

      const recommendation = await requestFragmentRecommendation(
        { now: timestamp },
        { database, createId, now: () => new Date(timestamp) },
      );

      if (recommendation === null) {
        return null;
      }

      requireRecordUpdated(
        await settingsRepository.update({ lastRecommendationDate: localDate }),
        "Settings",
      );

      return {
        settings: {
          ...settings,
          lastRecommendationDate: localDate,
        },
        recommendation,
      };
    },
  );
}
