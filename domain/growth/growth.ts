import type {
  FragmentCompletionStatus,
  FragmentEvent,
  FragmentEventType,
  PlantStage,
} from "../shared/types";

const GROWTH_SCORE_BY_EVENT_TYPE: Readonly<Partial<Record<FragmentEventType, number>>> = {
  text_added: 1,
  link_added: 1,
  image_added: 1,
  audio_added: 1,
  next_step_added: 1,
  progress_recorded: 2,
  cluster_joined: 1,
  child_fragment_created: 2,
};

function resolveUtcDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toISOString().slice(0, 10);
}

export function calculateGrowthScore(events: readonly FragmentEvent[]): number {
  const countedEventDays = new Set<string>();
  let growthScore = 0;

  for (const event of events) {
    const eventScore = GROWTH_SCORE_BY_EVENT_TYPE[event.type];

    if (eventScore === undefined) {
      continue;
    }

    const eventDayKey = `${event.type}:${resolveUtcDate(event.occurredAt)}`;

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
