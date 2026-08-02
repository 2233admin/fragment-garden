import type { RefObject } from "react";

type FragmentSproutSectionProps = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  isDisabled: boolean;
  onOpen: () => void;
};

export function FragmentSproutSection({
  buttonRef,
  isDisabled,
  onOpen,
}: FragmentSproutSectionProps) {
  return (
    <section className="rounded-2xl border border-garden-line bg-garden-soft/45 p-5">
      <h3 className="font-display text-xl font-semibold text-garden-ink">让想法再具体一点</h3>
      <p className="mt-2 text-sm leading-6 text-garden-muted">
        伙伴只会查看当前这条碎片，并提供一个由你决定是否保存的方向。
      </p>
      <button
        className="mt-4 rounded-full border border-garden-accent px-5 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
        disabled={isDisabled}
        onClick={onOpen}
        ref={buttonRef}
        type="button"
      >
        让伙伴帮它发芽
      </button>
    </section>
  );
}
