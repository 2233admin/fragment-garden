import type { CompanionType } from "@/domain";

import { CompanionMark } from "./CompanionMark";
import type { RecommendationPendingAction } from "./FragmentRecommendationCard";

export type CompanionStatusBubbleProps = {
  companionType: CompanionType;
  pendingAction: RecommendationPendingAction;
  onDismiss: () => void;
  onOpen: () => void;
};

export function CompanionStatusBubble({
  companionType,
  pendingAction,
  onDismiss,
  onOpen,
}: CompanionStatusBubbleProps) {
  const isPending = pendingAction !== null;

  return (
    <aside
      aria-label="花园伙伴提示"
      aria-live="polite"
      className="flex max-w-xl items-start gap-3 rounded-2xl border border-garden-line bg-garden-paper px-4 py-4 shadow-[0_12px_30px_rgba(24,55,43,0.08)]"
    >
      <CompanionMark companionType={companionType} size="small" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg leading-6 font-semibold text-garden-ink">
          今天要不要看看一株以前种下的植物？
        </p>
        <p className="mt-1 text-xs leading-5 text-garden-muted">
          这是一次轻量提醒，你可以稍后再看。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            aria-busy={pendingAction === "opening"}
            className="rounded-full bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={isPending}
            onClick={onOpen}
            type="button"
          >
            {pendingAction === "opening" ? "正在打开…" : "打开看看"}
          </button>
          <button
            aria-busy={pendingAction === "dismissing"}
            className="rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:cursor-wait disabled:opacity-55"
            disabled={isPending}
            onClick={onDismiss}
            type="button"
          >
            {pendingAction === "dismissing" ? "正在保存…" : "先不用"}
          </button>
        </div>
      </div>
    </aside>
  );
}
