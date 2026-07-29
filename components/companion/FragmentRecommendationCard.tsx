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
      className="companion-pixel-recommendation"
      data-fragment-id={recommendation.fragmentId}
    >
      <p className="companion-pixel-recommendation__eyebrow">值得再看一眼</p>
      <h3 className="companion-pixel-recommendation__title" id={titleId}>
        {recommendation.title}
      </h3>
      <p className="companion-pixel-recommendation__excerpt">
        {recommendation.excerpt || "这条碎片还没有可预览的文字。"}
      </p>

      <dl className="companion-pixel-recommendation__facts">
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

      <div className="companion-pixel-footer">
        <button
          aria-busy={pendingAction === "dismissing"}
          className="companion-pixel-button"
          disabled={isPending}
          onClick={onDismiss}
          type="button"
        >
          {pendingAction === "dismissing" ? "正在保存…" : "先不用"}
        </button>
        <button
          aria-busy={pendingAction === "opening"}
          className="companion-pixel-button companion-pixel-button--primary"
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
