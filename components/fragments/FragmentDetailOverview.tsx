import type { FragmentDetailViewModel } from "@/data/queries/fragment-detail-query";

import {
  COMPLETION_STATUS_LABELS,
  LIFECYCLE_STATUS_LABELS,
  PLANT_STAGE_LABELS,
  formatFragmentTimestamp,
} from "./fragment-presenters";

type FragmentDetailOverviewProps = {
  detail: FragmentDetailViewModel;
};

export function FragmentDetailOverview({ detail }: FragmentDetailOverviewProps) {
  const { fragment, plant, textSupplements } = detail;

  return (
    <div className="space-y-5">
      <dl className="grid gap-3 rounded-2xl border border-garden-line bg-garden-canvas/55 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            创建时间
          </dt>
          <dd className="mt-1 text-garden-ink">
            <time dateTime={fragment.createdAt}>{formatFragmentTimestamp(fragment.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            最近互动
          </dt>
          <dd className="mt-1 text-garden-ink">
            <time dateTime={fragment.lastInteractedAt}>
              {formatFragmentTimestamp(fragment.lastInteractedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            内容状态
          </dt>
          <dd className="mt-1 text-garden-ink">
            {LIFECYCLE_STATUS_LABELS[fragment.lifecycleStatus]} ·{" "}
            {COMPLETION_STATUS_LABELS[fragment.completionStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            植物成长
          </dt>
          <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-garden-ink">
            <span>成长阶段：{PLANT_STAGE_LABELS[plant.stage]}</span>
            <span>成长分：{plant.growthScore}</span>
          </dd>
        </div>
      </dl>

      <section>
        <h3 className="font-display text-xl font-semibold text-garden-ink">原始内容</h3>
        <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-garden-line bg-white p-5 text-sm leading-7 text-garden-ink">
          {fragment.rawText}
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-xl font-semibold text-garden-ink">文字补充历史</h3>
          <span className="text-xs text-garden-muted">{textSupplements.length} 条</span>
        </div>

        {textSupplements.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-garden-line px-4 py-5 text-sm text-garden-muted">
            还没有文字补充。新的补充会按时间保留在这里。
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {textSupplements.map((supplement) => (
              <li
                className="rounded-2xl border border-garden-line bg-white p-4"
                key={supplement.id}
              >
                <time
                  className="text-xs font-semibold text-garden-muted"
                  dateTime={supplement.occurredAt}
                >
                  {formatFragmentTimestamp(supplement.occurredAt)}
                </time>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-garden-ink">
                  {supplement.text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
