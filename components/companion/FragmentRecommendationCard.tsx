export type FragmentRecommendationView = {
  excerpt: string;
  fragmentId: string;
  id: string;
  lastInteractedAt: string;
  statusLabel: string;
  title: string;
};

export type RecommendationPendingAction = "opening" | "dismissing" | null;

export type FragmentRecommendationCardProps = {
  pendingAction: RecommendationPendingAction;
  recommendation: FragmentRecommendationView;
  onDismiss: () => void;
  onOpen: () => void;
};

const RECOMMENDATION_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatInteractionDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "时间未知" : RECOMMENDATION_DATE_FORMATTER.format(timestamp);
}

export function FragmentRecommendationCard({
  pendingAction,
  recommendation,
  onDismiss,
  onOpen,
}: FragmentRecommendationCardProps) {
  const titleId = `companion-recommendation-${recommendation.id}`;
  const isPending = pendingAction !== null;

  return (
    <article
      aria-labelledby={titleId}
      className="rounded-2xl border border-garden-accent/25 bg-garden-paper p-4 shadow-[0_12px_28px_rgba(24,55,43,0.08)]"
      data-fragment-id={recommendation.fragmentId}
    >
      <p className="text-xs font-semibold tracking-[0.14em] text-garden-accent uppercase">
        值得再看一眼
      </p>
      <h3
        className="mt-2 font-display text-xl leading-7 font-semibold text-garden-ink"
        id={titleId}
      >
        {recommendation.title}
      </h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-garden-muted">
        {recommendation.excerpt || "这条碎片还没有可预览的文字。"}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-garden-canvas/65 px-3 py-3 text-xs">
        <div>
          <dt className="text-garden-muted">最近互动</dt>
          <dd className="mt-1 font-semibold text-garden-ink">
            <time dateTime={recommendation.lastInteractedAt}>
              {formatInteractionDate(recommendation.lastInteractedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-garden-muted">植物状态</dt>
          <dd className="mt-1 font-semibold text-garden-ink">{recommendation.statusLabel}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          aria-busy={pendingAction === "dismissing"}
          className="rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:cursor-wait disabled:opacity-55"
          disabled={isPending}
          onClick={onDismiss}
          type="button"
        >
          {pendingAction === "dismissing" ? "正在保存…" : "先不用"}
        </button>
        <button
          aria-busy={pendingAction === "opening"}
          className="rounded-full bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:cursor-wait disabled:opacity-60"
          disabled={isPending}
          onClick={onOpen}
          type="button"
        >
          {pendingAction === "opening" ? "正在打开…" : "去看看"}
        </button>
      </div>
    </article>
  );
}
