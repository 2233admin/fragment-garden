export type GardenErrorKind = "data" | "load" | "initialize" | "update";

type GardenErrorStateProps = {
  kind: GardenErrorKind;
  onRetry: () => void;
  onShowCards: () => void;
};

const ERROR_DESCRIPTIONS: Readonly<Record<GardenErrorKind, string>> = {
  data: "无法读取花园显示数据。现有碎片没有被修改，卡片模式仍可正常使用。",
  load: "花园绘制模块没有成功载入。现有碎片仍安全保存在当前浏览器中。",
  initialize: "固定场景没有完成初始化。没有留下空白画布，也没有修改本地内容。",
  update: "场景没有完成本次植物更新。React 中的数据和卡片模式不受影响。",
};

export function GardenErrorState({ kind, onRetry, onShowCards }: GardenErrorStateProps) {
  return (
    <section
      aria-live="assertive"
      className="flex aspect-[3/2] min-h-72 flex-col items-center justify-center rounded-2xl border border-garden-danger/25 bg-garden-danger-soft px-8 text-center"
      role="alert"
    >
      <p className="text-xs font-semibold tracking-[0.18em] text-garden-danger uppercase">
        花园场景
      </p>
      <h2 className="mt-3 font-display text-2xl font-semibold text-garden-danger">
        花园暂时无法加载
      </h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-garden-danger">
        {ERROR_DESCRIPTIONS[kind]}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          className="rounded-full border border-garden-danger px-5 py-2.5 text-sm font-semibold text-garden-danger hover:bg-white/50"
          onClick={onRetry}
          type="button"
        >
          重新加载花园
        </button>
        <button
          className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong"
          onClick={onShowCards}
          type="button"
        >
          进入卡片模式
        </button>
      </div>
    </section>
  );
}
