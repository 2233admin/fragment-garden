import type {
  FragmentCompletionStatus,
  FragmentEvent,
  FragmentEventType,
  PlantStage,
} from "../shared/types";
import {
  SPROUT_MAX_DIRECTION_CHARACTERS,
  SPROUT_MAX_GUIDING_QUESTION_CHARACTERS,
  SPROUT_MAX_PROMPT_VERSION_CHARACTERS,
} from "../sprout/constants";
import { isLocalDateKey } from "../sprout/local-date";
import { isSproutRecommendedAction } from "../sprout/recommended-actions";

const GROWTH_SCORE_BY_EVENT_TYPE: Readonly<Partial<Record<FragmentEventType, number>>> = {
  text_added: 1,
  link_added: 1,
  image_added: 1,
  audio_added: 1,
  next_step_added: 1,
  progress_recorded: 2,
  cluster_joined: 1,
  child_fragment_created: 2,
  partner_suggestion_saved: 1,
};

function resolveUtcDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toISOString().slice(0, 10);
}

function isBoundedText(value: unknown, maxCharacters: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Array.from(value.trim()).length <= maxCharacters
  );
}

function isValidPartnerSuggestionPayload(payload: FragmentEvent["payload"]): boolean {
  if (payload === null) {
    return false;
  }

  const allowedKeys = new Set([
    "direction",
    "guidingQuestion",
    "recommendedAction",
    "source",
    "promptVersion",
    "localDateKey",
  ]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return false;
  }

  return (
    isBoundedText(payload.direction, SPROUT_MAX_DIRECTION_CHARACTERS) &&
    isBoundedText(payload.guidingQuestion, SPROUT_MAX_GUIDING_QUESTION_CHARACTERS) &&
    isSproutRecommendedAction(payload.recommendedAction) &&
    payload.source === "partner" &&
    isBoundedText(payload.promptVersion, SPROUT_MAX_PROMPT_VERSION_CHARACTERS) &&
    typeof payload.localDateKey === "string" &&
    isLocalDateKey(payload.localDateKey)
  );
}

function resolveGrowthDate(event: FragmentEvent): string | null {
  if (event.type !== "partner_suggestion_saved") {
    return resolveUtcDate(event.occurredAt);
  }

  return isValidPartnerSuggestionPayload(event.payload)
    ? (event.payload?.localDateKey as string)
    : null;
}

export function calculateGrowthScore(events: readonly FragmentEvent[]): number {
  const countedEventDays = new Set<string>();
  let growthScore = 0;

  for (const event of events) {
    const eventScore = GROWTH_SCORE_BY_EVENT_TYPE[event.type];

    if (eventScore === undefined) {
      continue;
    }

    // Every independently saved user supplement is meaningful growth. Editing an
    // existing note does not create another text_added event, so no date-based
    // deduplication is needed for this event type.
    if (event.type === "text_added") {
      growthScore += eventScore;
      continue;
    }

    const growthDate = resolveGrowthDate(event);
    if (growthDate === null) {
      continue;
    }

    const eventDayKey = `${event.type}:${growthDate}`;

    if (countedEventDays.has(eventDayKey)) {
      continue;
    }

    countedEventDays.add(eventDayKey);
    growthScore += eventScore;
  }

  return growthScore;
}

export function resolvePlantStage(
  events: readonly FragmentEvent[],
  completionStatus: FragmentCompletionStatus,
): PlantStage {
  if (completionStatus === "completed") {
    return "permanent_bloom";
  }

  const growthScore = calculateGrowthScore(events);

  if (growthScore >= 5) {
    return "blooming";
  }

  if (growthScore >= 3) {
    return "budding";
  }

  if (growthScore >= 1) {
    return "growing";
  }

  return "seedling";
}
