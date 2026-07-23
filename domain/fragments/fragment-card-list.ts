import type { FragmentCompletionStatus, FragmentLifecycleStatus } from "../shared/types";

export type FragmentCardSort = "created_desc" | "created_asc" | "interacted_desc";
export type FragmentCardFilter = "current" | "dormant" | "completed" | "archived";

export type SearchableFragmentCard = {
  id: string;
  title: string;
  rawText: string | null;
  createdAt: string;
  lastInteractedAt: string;
};

export type FilterableFragmentCard = {
  lifecycleStatus: FragmentLifecycleStatus;
  completionStatus: FragmentCompletionStatus;
};

function compareIds(leftId: string, rightId: string): number {
  if (leftId < rightId) {
    return -1;
  }

  if (leftId > rightId) {
    return 1;
  }

  return 0;
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

export function filterAndSortFragmentCards<T extends SearchableFragmentCard>(
  cards: readonly T[],
  searchTerm: string,
  sort: FragmentCardSort,
): T[] {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredCards =
    normalizedSearchTerm.length === 0
      ? [...cards]
      : cards.filter((card) => {
          const title = card.title.toLowerCase();
          const rawText = (card.rawText ?? "").toLowerCase();
          return title.includes(normalizedSearchTerm) || rawText.includes(normalizedSearchTerm);
        });

  return filteredCards.sort((left, right) => {
    let primaryComparison: number;

    switch (sort) {
      case "created_asc":
        primaryComparison = compareTimestamps(left.createdAt, right.createdAt);
        break;
      case "interacted_desc":
        primaryComparison = compareTimestamps(right.lastInteractedAt, left.lastInteractedAt);
        break;
      case "created_desc":
        primaryComparison = compareTimestamps(right.createdAt, left.createdAt);
        break;
    }

    return primaryComparison === 0 ? compareIds(left.id, right.id) : primaryComparison;
  });
}

export function filterFragmentCardsByStatus<T extends FilterableFragmentCard>(
  cards: readonly T[],
  filter: FragmentCardFilter,
): T[] {
  return cards.filter((card) => {
    if (card.lifecycleStatus === "deleted") {
      return false;
    }

    switch (filter) {
      case "current":
        return card.lifecycleStatus !== "archived";
      case "dormant":
        return card.lifecycleStatus === "dormant";
      case "completed":
        return card.completionStatus === "completed" && card.lifecycleStatus !== "archived";
      case "archived":
        return card.lifecycleStatus === "archived";
    }
  });
}
