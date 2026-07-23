import type { FragmentCardViewModel } from "@/data/queries/fragment-card-query";

import {
  COMPLETION_STATUS_LABELS,
  LIFECYCLE_STATUS_LABELS,
  PLANT_STAGE_LABELS,
  formatFragmentTimestamp,
  resolveGrowthStep,
} from "./fragment-presenters";

type FragmentCardProps = {
  fragment: FragmentCardViewModel;
  isOpening: boolean;
  onOpen: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
};

const GROWTH_TRACK_STEPS = [0, 1, 2, 3] as const;

export function FragmentCard({ fragment, isOpening, onOpen }: FragmentCardProps) {
  const growthStep = resolveGrowthStep(fragment.plantStage);
  const stageLabel = PLANT_STAGE_LABELS[fragment.plantStage];

  return (
    <li>
      <button
        aria-label={`打开碎片：${fragment.title}`}
        className="group flex min-h-72 w-full flex-col rounded-2xl border border-garden-line bg-garden-paper p-5 text-left shadow-[0_14px_36px_rgba(24,55,43,0.07)] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-garden-accent/45 hover:shadow-[0_18px_40px_rgba(24,55,43,0.1)] disabled:translate-y-0 disabled:opacity-65"
        disabled={isOpening}
        onClick={(event) => onOpen(fragment.id, event.currentTarget)}
        type="button"
      >
        <span className="flex w-full items-start justify-between gap-4">
          <span
            aria-level={2}
            className="font-display text-xl leading-7 font-semibold text-garden-ink"
            role="heading"
          >
            {fragment.title}
          </span>
          <span className="shrink-0 rounded-full bg-garden-soft px-2.5 py-1 text-xs font-semibold text-garden-accent-strong">
            {LIFECYCLE_STATUS_LABELS[fragment.lifecycleStatus]}
          </span>
        </span>

        <span className="mt-3 line-clamp-3 min-h-18 text-sm leading-6 text-garden-muted">
          {fragment.excerpt || "这条碎片还没有可预览的文字。"}
        </span>

        <span className="mt-5 block w-full rounded-xl border border-garden-line/80 bg-garden-canvas/55 px-3.5 py-3">
          <span className="flex items-center justify-between gap-3 text-xs font-semibold text-garden-accent-strong">
            <span>成长阶段：{stageLabel}</span>
            <span>成长分：{fragment.growthScore}</span>
          </span>
          <span aria-hidden="true" className="mt-3 grid grid-cols-4 items-center gap-2">
            {GROWTH_TRACK_STEPS.map((step) => (
              <span
                className={`h-1.5 rounded-full ${
                  step <= growthStep ? "bg-garden-accent" : "bg-garden-line"
                }`}
                key={step}
              />
            ))}
          </span>
        </span>

        <span className="mt-auto block w-full pt-5 text-xs leading-5 text-garden-muted">
          <span className="block">
            创建于{" "}
            <time dateTime={fragment.createdAt}>{formatFragmentTimestamp(fragment.createdAt)}</time>
          </span>
          <span className="mt-1 block">
            最近互动{" "}
            <time dateTime={fragment.lastInteractedAt}>
              {formatFragmentTimestamp(fragment.lastInteractedAt)}
            </time>
          </span>
          <span className="mt-2 inline-flex rounded-full border border-garden-line px-2.5 py-1">
            内容状态：
            {COMPLETION_STATUS_LABELS[fragment.completionStatus]}
          </span>
        </span>

        {isOpening ? (
          <span className="mt-3 text-xs font-semibold text-garden-accent">正在打开…</span>
        ) : null}
      </button>
    </li>
  );
}
