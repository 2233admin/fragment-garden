import type { Recommendation } from "../domain/shared/types";
import { RecommendationRepository } from "../data/repositories/recommendation-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";
import { recordFragmentViewed, type RecordFragmentViewedResult } from "./record-fragment-viewed";

export type OpenFragmentRecommendationInput = Readonly<{
  recommendationId: string;
  now: string;
}>;

export type OpenFragmentRecommendationResult = Readonly<{
  recommendation: Recommendation;
  viewed: RecordFragmentViewedResult;
}>;

export async function openFragmentRecommendation(
  input: OpenFragmentRecommendationInput,
  dependencies: LocalServiceDependencies = {},
): Promise<OpenFragmentRecommendationResult> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const recommendationRepository = new RecommendationRepository(database);

  return database.transaction(
    "rw",
    database.recommendations,
    database.fragments,
    database.plants,
    database.fragmentEvents,
    async () => {
      const recommendation = await recommendationRepository.getById(input.recommendationId);

      if (recommendation === undefined) {
        throw new Error(`Recommendation ${input.recommendationId} was not found`);
      }

      if (recommendation.openedAt !== null || recommendation.dismissedAt !== null) {
        throw new Error(`Recommendation ${input.recommendationId} is no longer available`);
      }

      requireRecordUpdated(
        await recommendationRepository.update(recommendation.id, { openedAt: timestamp }),
        "Recommendation",
      );
      const viewed = await recordFragmentViewed(
        { fragmentId: recommendation.fragmentId },
        { database, createId, now: () => new Date(timestamp) },
      );

      return {
        recommendation: {
          ...recommendation,
          openedAt: timestamp,
        },
        viewed,
      };
    },
  );
}
