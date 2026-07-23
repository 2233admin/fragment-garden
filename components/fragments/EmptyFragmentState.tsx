type EmptyFragmentStateProps = {
  onCreate: (triggerElement: HTMLButtonElement) => void;
};

export function EmptyFragmentState({ onCreate }: EmptyFragmentStateProps) {
  return (
    <section className="rounded-2xl border border-dashed border-garden-line bg-garden-paper/75 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="mx-auto flex h-12 w-12 items-end justify-center rounded-full bg-garden-soft pb-2"
      >
        <span className="h-5 w-1.5 rounded-full bg-garden-accent" />
        <span className="-ml-0.5 mb-2 h-2.5 w-4 -rotate-12 rounded-[100%_0_100%_0] bg-garden-accent/75" />
      </div>
      <h2 className="mt-5 font-display text-2xl font-semibold text-garden-ink">还没有种下碎片</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-garden-muted">
        先记下一件暂时不处理、但也不想忘记的事。它会安全保存在当前浏览器里。
      </p>
      <button
        className="mt-6 rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong"
        onClick={(event) => onCreate(event.currentTarget)}
        type="button"
      >
        种下第一条碎片
      </button>
    </section>
  );
}
