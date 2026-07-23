import { describe, expect, it } from "vitest";

import { filterAndSortFragmentCards, type SearchableFragmentCard } from "../../../domain";

const CARDS: readonly SearchableFragmentCard[] = [
  {
    id: "fragment-b",
    title: "Product Idea",
    rawText: "一段中文正文",
    createdAt: "2026-07-24T00:00:00.000Z",
    lastInteractedAt: "2026-07-24T01:00:00.000Z",
  },
  {
    id: "fragment-a",
    title: "旅行清单",
    rawText: "Remember THE camera",
    createdAt: "2026-07-24T00:00:00.000Z",
    lastInteractedAt: "2026-07-25T01:00:00.000Z",
  },
  {
    id: "fragment-c",
    title: "较早创建",
    rawText: "其他内容",
    createdAt: "2026-07-22T00:00:00.000Z",
    lastInteractedAt: "2026-07-23T01:00:00.000Z",
  },
];

describe("filterAndSortFragmentCards", () => {
  it("searches titles and raw text", () => {
    expect(
      filterAndSortFragmentCards(CARDS, "Product", "created_desc").map((card) => card.id),
    ).toEqual(["fragment-b"]);
    expect(
      filterAndSortFragmentCards(CARDS, "中文正文", "created_desc").map((card) => card.id),
    ).toEqual(["fragment-b"]);
  });

  it("trims the search term and ignores English case", () => {
    expect(
      filterAndSortFragmentCards(CARDS, "  the  ", "created_desc").map((card) => card.id),
    ).toEqual(["fragment-a"]);
  });

  it("returns all cards for an empty search", () => {
    expect(filterAndSortFragmentCards(CARDS, "   ", "created_desc")).toHaveLength(CARDS.length);
  });

  it("sorts by newest and oldest creation with id tie breakers", () => {
    expect(filterAndSortFragmentCards(CARDS, "", "created_desc").map((card) => card.id)).toEqual([
      "fragment-a",
      "fragment-b",
      "fragment-c",
    ]);
    expect(filterAndSortFragmentCards(CARDS, "", "created_asc").map((card) => card.id)).toEqual([
      "fragment-c",
      "fragment-a",
      "fragment-b",
    ]);
  });

  it("sorts by most recent interaction with a stable id tie breaker", () => {
    const cardsWithTie = CARDS.map((card) => ({
      ...card,
      lastInteractedAt: "2026-07-25T00:00:00.000Z",
    }));

    expect(
      filterAndSortFragmentCards(cardsWithTie, "", "interacted_desc").map((card) => card.id),
    ).toEqual(["fragment-a", "fragment-b", "fragment-c"]);
  });

  it("does not mutate the source array", () => {
    const source = [...CARDS];
    const originalOrder = source.map((card) => card.id);

    filterAndSortFragmentCards(source, "", "created_asc");

    expect(source.map((card) => card.id)).toEqual(originalOrder);
  });
});
