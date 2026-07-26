import type { Fragment, FragmentEvent, FragmentEventType, Plant } from "../../../domain";
import { FragmentGardenDatabase } from "../../../data/db";

export const STAGE_TWO_TEST_DATE = new Date("2026-07-24T08:30:00.000Z");
export const STAGE_TWO_TEST_TIMESTAMP = STAGE_TWO_TEST_DATE.toISOString();

export function createStageTwoDatabase(label: string): FragmentGardenDatabase {
  return new FragmentGardenDatabase(`fragment-garden-${label}-${crypto.randomUUID()}`);
}

export function createStageTwoFragment(overrides: Partial<Fragment> = {}): Fragment {
  return {
    id: "fragment-1",
    contentType: "text",
    title: "原始标题",
    rawText: "原始正文",
    sourceUrl: null,
    contentMarkdown: "原始正文",
    summary: null,
    keywords: [],
    lifecycleStatus: "active",
    completionStatus: "open",
    analysisStatus: "not_required",
    embedding: null,
    parentFragmentId: null,
    createdAt: "2026-07-23T08:30:00.000Z",
    updatedAt: "2026-07-23T08:30:00.000Z",
    lastInteractedAt: "2026-07-23T08:30:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

export function createStageTwoPlant(overrides: Partial<Plant> = {}): Plant {
  return {
    id: "plant-1",
    fragmentId: "fragment-1",
    speciesId: null,
    stage: "seedling",
    vitality: "active",
    growthScore: 0,
    slotId: "slot-01",
    createdAt: "2026-07-23T08:30:00.000Z",
    updatedAt: "2026-07-23T08:30:00.000Z",
    ...overrides,
  };
}

export function createStageTwoEvent(
  type: FragmentEventType,
  overrides: Partial<FragmentEvent> = {},
): FragmentEvent {
  return {
    id: `event-${type}`,
    fragmentId: "fragment-1",
    type,
    payload: null,
    occurredAt: "2026-07-23T08:30:00.000Z",
    ruleVersion: 1,
    ...overrides,
  };
}

export function createIdSequence(ids: readonly string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (id === undefined) {
      throw new Error("Test ID sequence exhausted");
    }

    return id;
  };
}
