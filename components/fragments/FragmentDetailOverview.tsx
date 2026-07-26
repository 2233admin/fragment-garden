"use client";

import { useState } from "react";

import type { FragmentDetailViewModel } from "@/data/queries/fragment-detail-query";

import { formatFragmentTimestamp } from "./fragment-presenters";

type FragmentDetailOverviewProps = Readonly<{
  detail: FragmentDetailViewModel;
  onOpenRelatedFragment: (fragmentId: string) => Promise<boolean>;
  titleId: string;
}>;

export function FragmentDetailOverview({
  detail,
  onOpenRelatedFragment,
  titleId,
}: FragmentDetailOverviewProps) {
  const { childFragments, fragment, sourceFragment } = detail;
  const [openingFragmentId, setOpeningFragmentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function openRelatedFragment(fragmentId: string): Promise<void> {
    if (openingFragmentId !== null) {
      return;
    }

    setOpeningFragmentId(fragmentId);
    setErrorMessage(null);
    try {
      const didOpen = await onOpenRelatedFragment(fragmentId);
      if (!didOpen) {
        setErrorMessage("暂时没能打开这条笔记，它仍然保存在卡片列表中。");
      }
    } catch {
      setErrorMessage("暂时没能打开这条笔记，它仍然保存在卡片列表中。");
    } finally {
      setOpeningFragmentId(null);
    }
  }

  return (
    <header>
      <h2 className="font-display text-3xl font-semibold text-garden-ink sm:text-4xl" id={titleId}>
        {fragment.title}
      </h2>
      <p className="mt-3 text-sm text-garden-muted">
        <time dateTime={fragment.createdAt}>{formatFragmentTimestamp(fragment.createdAt)}</time>
      </p>

      {sourceFragment !== null || childFragments.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-garden-line pt-4 text-sm text-garden-muted">
          {sourceFragment !== null ? (
            <button
              className="font-semibold text-garden-accent hover:text-garden-accent-strong disabled:opacity-50"
              disabled={openingFragmentId !== null}
              onClick={() => void openRelatedFragment(sourceFragment.id)}
              type="button"
            >
              源自「{sourceFragment.title}」
            </button>
          ) : null}
          {childFragments.map((childFragment) => (
            <button
              className="font-semibold text-garden-accent hover:text-garden-accent-strong disabled:opacity-50"
              disabled={openingFragmentId !== null}
              key={childFragment.id}
              onClick={() => void openRelatedFragment(childFragment.id)}
              type="button"
            >
              延伸到「{childFragment.title}」
            </button>
          ))}
        </div>
      ) : null}

      {errorMessage !== null ? (
        <p aria-live="polite" className="mt-3 text-sm text-garden-danger" role="status">
          {errorMessage}
        </p>
      ) : null}
    </header>
  );
}
