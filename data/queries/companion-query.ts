import type { ChatMessage, Fragment, Recommendation, Settings } from "../../domain/shared/types";
import { createDefaultSettings } from "../../domain/companion/settings";
import { FragmentGardenDatabase, fragmentGardenDb } from "../db";
import { ChatMessageRepository } from "../repositories/chat-message-repository";
import { FragmentRepository } from "../repositories/fragment-repository";
import { RecommendationRepository } from "../repositories/recommendation-repository";
import { SettingsRepository } from "../repositories/settings-repository";

export type CurrentRecommendationView = Readonly<{
  recommendation: Recommendation;
  fragment: Fragment;
}>;

export async function queryLocalSettings(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<Settings> {
  const stored = await new SettingsRepository(database).get();
  const defaults = createDefaultSettings();
  return {
    ...defaults,
    ...stored,
    openAiDisclosureAcceptedAt: stored?.openAiDisclosureAcceptedAt ?? null,
    companionAiMode: stored?.companionAiMode === "openai" ? "openai" : "local",
    sproutAiDisclosureAcceptedAt: stored?.sproutAiDisclosureAcceptedAt ?? null,
    imageAiDisclosureAcceptedAt: stored?.imageAiDisclosureAcceptedAt ?? null,
    voiceAiDisclosureAcceptedAt: stored?.voiceAiDisclosureAcceptedAt ?? null,
  };
}

export function listChatMessages(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<ChatMessage[]> {
  return new ChatMessageRepository(database).list();
}

export async function getCurrentRecommendationView(
  database: FragmentGardenDatabase = fragmentGardenDb,
): Promise<CurrentRecommendationView | null> {
  const recommendationRepository = new RecommendationRepository(database);
  const fragmentRepository = new FragmentRepository(database);
  const [recommendations, fragments] = await Promise.all([
    recommendationRepository.list(),
    fragmentRepository.list(),
  ]);
  const fragmentsById = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  const pendingRecommendations = recommendations
    .filter(
      (recommendation) => recommendation.openedAt === null && recommendation.dismissedAt === null,
    )
    .reverse();

  for (const recommendation of pendingRecommendations) {
    const fragment = fragmentsById.get(recommendation.fragmentId);
    const isStillAvailable =
      fragment !== undefined &&
      (fragment.lifecycleStatus === "active" || fragment.lifecycleStatus === "dormant") &&
      fragment.completionStatus === "open";

    if (isStillAvailable) {
      return { recommendation, fragment };
    }
  }

  return null;
}
