import type { Fragment } from "@/domain";

type FragmentLinkDetailPanelProps = Readonly<{
  fragment: Fragment;
}>;

function deriveSourceName(sourceUrl: string | null): string {
  if (sourceUrl === null) {
    return "外部链接";
  }

  try {
    return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "外部链接";
  }
}

export function FragmentLinkDetailPanel({ fragment }: FragmentLinkDetailPanelProps) {
  return (
    <aside
      aria-label="链接来源"
      className="flex items-center gap-3 border-y border-garden-line py-3 text-sm"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-garden-soft font-semibold text-garden-accent"
      >
        ↗
      </span>
      <p className="min-w-0 text-garden-muted">
        来源
        <span className="ml-2 font-semibold text-garden-ink">
          {deriveSourceName(fragment.sourceUrl)}
        </span>
      </p>
    </aside>
  );
}
