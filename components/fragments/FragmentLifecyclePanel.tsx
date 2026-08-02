import type {
  FragmentCompletionStatus,
  FragmentLifecycleStatus,
  FragmentReviewDecision,
} from "@/domain";

import { AsyncButton } from "../shared/AsyncButton";

export type FragmentLifecyclePendingAction =
  "review_still_interested" | "review_not_now" | "restore" | null;

type FragmentLifecyclePanelProps = {
  completionStatus: FragmentCompletionStatus;
  isDisabled: boolean;
  lifecycleStatus: FragmentLifecycleStatus;
  onCreateChild: () => void;
  onOpenDisposition: () => void;
  onOpenCompletion: () => void;
  onRestore: () => void;
  onReview: (decision: Exclude<FragmentReviewDecision, "no_longer_needed">) => void;
  pendingAction: FragmentLifecyclePendingAction;
};

export function FragmentLifecyclePanel({
  completionStatus,
  isDisabled,
  lifecycleStatus,
  onCreateChild,
  onOpenCompletion,
  onOpenDisposition,
  onRestore,
  onReview,
  pendingAction,
}: FragmentLifecyclePanelProps) {
  const isBusy = isDisabled || pendingAction !== null;
  const isArchived = lifecycleStatus === "archived";
  const isCompleted = completionStatus === "completed";

  return (
    <div className="space-y-5">
      {!isArchived ? (
        <section
          aria-labelledby="fragment-review-heading"
          className="rounded-2xl border border-garden-line bg-garden-soft/45 p-5"
        >
          <h3
            className="font-display text-xl font-semibold text-garden-ink"
            id="fragment-review-heading"
          >
            这条碎片现在怎么样？
          </h3>
          <p className="mt-2 text-sm leading-6 text-garden-muted">
            只记录你现在的判断，不会评分，也不会要求你马上完成。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <AsyncButton
              className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
              disabled={isBusy}
              isPending={pendingAction === "review_still_interested"}
              onClick={() => onReview("still_interested")}
              pendingLabel="正在记下…"
              type="button"
            >
              仍然感兴趣
            </AsyncButton>

            {!isCompleted ? (
              <AsyncButton
                className="rounded-full border border-garden-line bg-white px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-60"
                disabled={isBusy}
                isPending={pendingAction === "review_not_now"}
                onClick={() => onReview("not_now")}
                pendingLabel="正在让它休息…"
                type="button"
              >
                暂时用不上
              </AsyncButton>
            ) : null}

            <button
              className="rounded-full border border-garden-danger/55 bg-white px-5 py-2.5 text-sm font-semibold text-garden-danger hover:bg-garden-danger-soft disabled:opacity-50"
              disabled={isBusy}
              onClick={onOpenDisposition}
              type="button"
            >
              不再需要
            </button>
          </div>
          {isCompleted ? (
            <p className="mt-3 text-xs leading-5 text-garden-muted">
              已完成内容会永久盛开，因此不再提供“暂时用不上”。
            </p>
          ) : null}
        </section>
      ) : null}

      <section
        aria-labelledby="fragment-lifecycle-heading"
        className="rounded-2xl border border-garden-line bg-white p-5"
      >
        <h3
          className="font-display text-xl font-semibold text-garden-ink"
          id="fragment-lifecycle-heading"
        >
          整理与生长
        </h3>
        <p className="mt-2 text-sm leading-6 text-garden-muted">
          完成和发展成新想法是两种不同的结果，你可以按内容现在的方向选择。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {isArchived ? (
            <AsyncButton
              className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
              disabled={isBusy}
              isPending={pendingAction === "restore"}
              onClick={onRestore}
              pendingLabel="正在恢复…"
              type="button"
            >
              恢复到花园
            </AsyncButton>
          ) : null}

          {!isCompleted ? (
            <button
              className="rounded-full border border-garden-accent px-5 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
              disabled={isBusy}
              onClick={onOpenCompletion}
              type="button"
            >
              标记为已完成
            </button>
          ) : null}

          <button
            className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isBusy}
            onClick={onCreateChild}
            type="button"
          >
            让它长成一个新想法
          </button>
        </div>
        {isArchived ? (
          <p className="mt-3 text-xs leading-5 text-garden-muted">
            封存只改变它在花园中的位置；内容仍可编辑、补充、完成或发展成新想法。
          </p>
        ) : null}
      </section>
    </div>
  );
}
