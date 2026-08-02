import type { FragmentCompletionStatus } from "../shared/types";

const DORMANCY_THRESHOLD_MS = 72 * 60 * 60 * 1000;

export function shouldFragmentBeDormant({
  lastInteractedAt,
  completionStatus,
  now,
}: {
  lastInteractedAt: string;
  completionStatus: FragmentCompletionStatus;
  now: string;
}): boolean {
  if (completionStatus === "completed") {
    return false;
  }

  return Date.parse(now) - Date.parse(lastInteractedAt) >= DORMANCY_THRESHOLD_MS;
}
