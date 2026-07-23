import type { Recommendation } from "../domain/shared/types";
import { RecommendationRepository } from "../data/repositories/recommendation-repository";
import {
  type LocalServiceDependencies,
  requireRecordUpdated,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type DismissFragmentRecommendationInput = Readonly<{
  recommendationId: string;
  now: string;
}>;

export async function dismissFragmentRecommendation(
  input: DismissFragmentRecommendationInput,
  dependencies: LocalServiceDependencies = {},
): Promise<Recommendation> {
  const { database, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const recommendationRepository = new RecommendationRepository(database);

  return database.transaction("rw", database.recommendations, async () => {
    const recommendation = await recommendationRepository.getById(input.recommendationId);

    if (recommendation === undefined) {
      throw new Error(`Recommendation ${input.recommendationId} was not found`);
    }

    if (recommendation.openedAt !== null) {
      throw new Error(`Opened recommendation ${input.recommendationId} cannot be dismissed`);
    }

    if (recommendation.dismissedAt !== null) {
      return recommendation;
    }

    requireRecordUpdated(
      await recommendationRepository.update(recommendation.id, { dismissedAt: timestamp }),
      "Recommendation",
    );

    return {
      ...recommendation,
      dismissedAt: timestamp,
    };
  });
}
