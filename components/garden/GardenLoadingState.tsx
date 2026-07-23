type GardenLoadingStateProps = {
  phase: "data" | "runtime";
};

export function GardenLoadingState({ phase }: GardenLoadingStateProps) {
  return (
    <section
      aria-live="polite"
      className="flex h-full min-h-72 flex-col items-center justify-center bg-garden-paper/92 px-8 text-center"
      role="status"
    >
      <div
        aria-hidden="true"
        className="h-9 w-9 rounded-full border-4 border-garden-soft border-t-garden-accent"
      />
      <h2 className="mt-5 font-display text-2xl font-semibold text-garden-ink">
        {phase === "data" ? "正在读取本地花园…" : "正在铺开花园地图…"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-garden-muted">
        {phase === "data"
          ? "正在组合当前浏览器中的碎片和植物数据。"
          : "植物已经安全保存在本地，场景准备好后会立即显示。"}
      </p>
    </section>
  );
}
