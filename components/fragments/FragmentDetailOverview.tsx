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
  const { childFragments, completion, fragment, history, plant, sourceFragment, textSupplements } =
    detail;

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
          <dd className="mt-2 flex flex-wrap gap-2 text-garden-ink">
            <span className="rounded-full border border-garden-line bg-white px-2.5 py-1 text-xs font-semibold">
              {LIFECYCLE_STATUS_LABELS[fragment.lifecycleStatus]}
            </span>
            <span className="rounded-full border border-garden-line bg-white px-2.5 py-1 text-xs font-semibold">
              {COMPLETION_STATUS_LABELS[fragment.completionStatus]}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            植物成长
          </dt>
          <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-garden-ink">
            <span>
              成长阶段：
              <strong className="font-normal">{PLANT_STAGE_LABELS[plant.stage]}</strong>
            </span>
            <span>成长分：{plant.growthScore}</span>
            {plant.slotId === null && fragment.lifecycleStatus !== "archived" ? (
              <span className="w-full text-garden-muted">花园位置已满，植物暂未放置</span>
            ) : null}
          </dd>
        </div>
      </dl>

      {fragment.completionStatus === "completed" ? (
        <section className="rounded-2xl border border-garden-accent/25 bg-garden-soft/45 p-5">
          <h3 className="font-display text-xl font-semibold text-garden-ink">完成结果</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-garden-ink">
            {completion?.outcome ?? "这次完成没有填写结果说明。"}
          </p>
          {completion !== null ? (
            <p className="mt-2 text-xs text-garden-muted">
              完成于{" "}
              <time dateTime={completion.occurredAt}>
                {formatFragmentTimestamp(completion.occurredAt)}
              </time>
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h3 className="font-display text-xl font-semibold text-garden-ink">原始内容</h3>
        <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-garden-line bg-white p-5 text-sm leading-7 text-garden-ink">
          {fragment.rawText}
        </p>
      </section>

      <section className="rounded-2xl border border-garden-line bg-white p-5">
        <h3 className="font-display text-xl font-semibold text-garden-ink">想法来源与生长</h3>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-garden-muted">生长自</dt>
            <dd className="mt-1 text-garden-ink">
              {sourceFragment === null ? "这是一个独立种下的想法。" : sourceFragment.title}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-garden-muted">发展出的新想法</dt>
            <dd className="mt-2">
              {childFragments.length === 0 ? (
                <span className="text-garden-muted">还没有发展出新的想法。</span>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {childFragments.map((childFragment) => (
                    <li
                      className="rounded-full border border-garden-line bg-garden-canvas/55 px-3 py-1.5 text-garden-ink"
                      key={childFragment.id}
                    >
                      {childFragment.title}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
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

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-xl font-semibold text-garden-ink">成长与状态记录</h3>
          <span className="text-xs text-garden-muted">{history.length} 条</span>
        </div>

        {history.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-garden-line px-4 py-5 text-sm text-garden-muted">
            还没有可显示的成长记录。
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {[...history].reverse().map((item) => (
              <li
                className="flex flex-col gap-1 rounded-xl border border-garden-line bg-garden-canvas/45 px-4 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between"
                key={item.id}
              >
                <span className="font-semibold text-garden-ink">{item.label}</span>
                <time className="shrink-0 text-xs text-garden-muted" dateTime={item.occurredAt}>
                  {formatFragmentTimestamp(item.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
