import type { FragmentCardViewModel } from "@/data/queries/fragment-card-query";

import { FragmentCard } from "./FragmentCard";

type FragmentListProps = {
  fragments: readonly FragmentCardViewModel[];
  openingFragmentId: string | null;
  onOpen: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  onRetryLinkImport?: (fragmentId: string) => Promise<void>;
};

export function FragmentList({
  fragments,
  openingFragmentId,
  onOpen,
  onRetryLinkImport,
}: FragmentListProps) {
  return (
    <ul aria-label="碎片列表" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {fragments.map((fragment) => (
        <FragmentCard
          fragment={fragment}
          isOpening={openingFragmentId === fragment.id}
          key={fragment.id}
          onOpen={onOpen}
          onRetryLinkImport={onRetryLinkImport}
        />
      ))}
    </ul>
  );
}
