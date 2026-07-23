export type FragmentCardSort = "created_desc" | "created_asc" | "interacted_desc";

export type SearchableFragmentCard = {
  id: string;
  title: string;
  rawText: string | null;
  createdAt: string;
  lastInteractedAt: string;
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
