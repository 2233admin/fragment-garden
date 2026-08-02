import type { Fragment, Recommendation } from "../shared/types";

const MINIMUM_RECOMMENDATION_AGE_MS = 24 * 60 * 60 * 1000;

export type SelectFragmentRecommendationInput = Readonly<{
  fragments: readonly Fragment[];
  recommendations: readonly Recommendation[];
  now: string;
}>;

function parseTimestamp(timestamp: string): number {
  return new Date(timestamp).getTime();
}

export function toLocalDateKey(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function compareCandidates(left: Fragment, right: Fragment): number {
  const lastInteractedComparison =
    parseTimestamp(left.lastInteractedAt) - parseTimestamp(right.lastInteractedAt);
  if (lastInteractedComparison !== 0) {
    return lastInteractedComparison;
  }

  const createdComparison = parseTimestamp(left.createdAt) - parseTimestamp(right.createdAt);
  return createdComparison === 0 ? left.id.localeCompare(right.id) : createdComparison;
}

export function selectFragmentRecommendation(
  input: SelectFragmentRecommendationInput,
): Fragment | null {
  const nowTimestamp = parseTimestamp(input.now);
  if (Number.isNaN(nowTimestamp)) {
    throw new Error(`Invalid timestamp: ${input.now}`);
  }

  const localDate = toLocalDateKey(input.now);
  const shownTodayFragmentIds = new Set(
    input.recommendations
      .filter((recommendation) => toLocalDateKey(recommendation.shownAt) === localDate)
      .map((recommendation) => recommendation.fragmentId),
  );

  const candidates = input.fragments.filter((fragment) => {
    const isEligibleLifecycle =
      fragment.lifecycleStatus === "active" || fragment.lifecycleStatus === "dormant";
    const age = nowTimestamp - parseTimestamp(fragment.createdAt);

    return (
      isEligibleLifecycle &&
      fragment.completionStatus === "open" &&
      age >= MINIMUM_RECOMMENDATION_AGE_MS &&
      !shownTodayFragmentIds.has(fragment.id)
    );
  });

  return candidates.sort(compareCandidates)[0] ?? null;
}
