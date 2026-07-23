"use client";

import { useLiveQuery } from "dexie-react-hooks";

import type { ChatMessage, Settings } from "@/domain";
import {
  getCurrentRecommendationView,
  listChatMessages,
  queryLocalSettings,
  type CurrentRecommendationView,
} from "@/data/queries/companion-query";

export type CompanionQueryState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error" }>
  | Readonly<{ status: "ready"; value: T }>;

const LOADING_SETTINGS: CompanionQueryState<Settings> = { status: "loading" };
const LOADING_MESSAGES: CompanionQueryState<ChatMessage[]> = { status: "loading" };
const LOADING_RECOMMENDATION: CompanionQueryState<CurrentRecommendationView | null> = {
  status: "loading",
};

export function useCompanionData(settingsAttempt: number): Readonly<{
  messagesState: CompanionQueryState<ChatMessage[]>;
  recommendationState: CompanionQueryState<CurrentRecommendationView | null>;
  settingsState: CompanionQueryState<Settings>;
}> {
  const settingsState: CompanionQueryState<Settings> = useLiveQuery(
    async (): Promise<CompanionQueryState<Settings>> => {
      try {
        return { status: "ready", value: await queryLocalSettings() };
      } catch {
        return { status: "error" };
      }
    },
    [settingsAttempt],
    LOADING_SETTINGS,
  );
  const messagesState: CompanionQueryState<ChatMessage[]> = useLiveQuery(
    async (): Promise<CompanionQueryState<ChatMessage[]>> => {
      try {
        return { status: "ready", value: await listChatMessages() };
      } catch {
        return { status: "error" };
      }
    },
    [],
    LOADING_MESSAGES,
  );
  const recommendationState: CompanionQueryState<CurrentRecommendationView | null> = useLiveQuery(
    async (): Promise<CompanionQueryState<CurrentRecommendationView | null>> => {
      try {
        return { status: "ready", value: await getCurrentRecommendationView() };
      } catch {
        return { status: "error" };
      }
    },
    [],
    LOADING_RECOMMENDATION,
  );

  return { messagesState, recommendationState, settingsState };
}
