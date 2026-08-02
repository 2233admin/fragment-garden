import type {
  FragmentCompletionStatus,
  FragmentLifecycleStatus,
  SproutRecommendedAction,
} from "../shared/types";

export const SPROUT_RECOMMENDED_ACTION_LABELS: Readonly<Record<SproutRecommendedAction, string>> = {
  add_content: "补充一点内容",
  record_next_step: "写下下一步",
  grow_new_idea: "发展成一个新想法",
  keep_for_later: "暂时保留",
  mark_completed: "标记为完成",
};

export function isSproutRecommendedAction(value: unknown): value is SproutRecommendedAction {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SPROUT_RECOMMENDED_ACTION_LABELS, value)
  );
}

export function isSproutRecommendedActionAllowed(
  action: SproutRecommendedAction,
  state: Readonly<{
    completionStatus: FragmentCompletionStatus;
    lifecycleStatus: FragmentLifecycleStatus;
  }>,
): boolean {
  if (state.lifecycleStatus === "deleted") {
    return false;
  }

  return !(state.completionStatus === "completed" && action === "mark_completed");
}
