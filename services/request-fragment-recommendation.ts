import type { Fragment, Recommendation } from "../domain/shared/types";
import { selectFragmentRecommendation } from "../domain/recommendations/select-fragment-recommendation";
import { FragmentRepository } from "../data/repositories/fragment-repository";
import { RecommendationRepository } from "../data/repositories/recommendation-repository";
import {
  type LocalServiceDependencies,
  resolveLocalServiceDependencies,
} from "./local-service-dependencies";

export type RequestFragmentRecommendationInput = Readonly<{
  now: string;
}>;

export type FragmentRecommendationResult = Readonly<{
  fragment: Fragment;
  recommendation: Recommendation;
}>;

export async function requestFragmentRecommendation(
  input: RequestFragmentRecommendationInput,
  dependencies: LocalServiceDependencies = {},
): Promise<FragmentRecommendationResult | null> {
  const { database, createId, timestamp } = resolveLocalServiceDependencies({
    ...dependencies,
    now: () => new Date(input.now),
  });
  const fragmentRepository = new FragmentRepository(database);
  const recommendationRepository = new RecommendationRepository(database);

  return database.transaction("rw", database.fragments, database.recommendations, async () => {
    const [fragments, recommendations] = await Promise.all([
      fragmentRepository.list(),
      recommendationRepository.list(),
    ]);
    const fragment = selectFragmentRecommendation({
      fragments,
      recommendations,
      now: timestamp,
    });

    if (fragment === null) {
      return null;
    }

    const recommendation: Recommendation = {
      id: createId(),
      fragmentId: fragment.id,
      reason: fragment.lifecycleStatus === "dormant" ? "dormant" : "not_reviewed",
      shownAt: timestamp,
      openedAt: null,
      dismissedAt: null,
    };

    await recommendationRepository.add(recommendation);

    return { fragment, recommendation };
  });
}
