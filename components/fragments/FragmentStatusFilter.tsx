import type { FragmentCardFilter } from "@/domain";

type FragmentStatusFilterProps = {
  onChange: (value: FragmentCardFilter) => void;
  value: FragmentCardFilter;
};

const FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: FragmentCardFilter;
}> = [
  { label: "当前", value: "current" },
  { label: "休眠", value: "dormant" },
  { label: "已完成", value: "completed" },
  { label: "已封存", value: "archived" },
];

export function FragmentStatusFilter({ onChange, value }: FragmentStatusFilterProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold tracking-[0.12em] text-garden-muted uppercase">
        按状态筛选
      </legend>
      <div aria-label="碎片状态" className="flex flex-wrap gap-2" role="group">
        {FILTER_OPTIONS.map((option) => {
          const isSelected = option.value === value;

          return (
            <button
              aria-pressed={isSelected}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                isSelected
                  ? "border-garden-accent bg-garden-accent text-white"
                  : "border-garden-line bg-garden-paper text-garden-ink hover:border-garden-accent/55 hover:bg-garden-soft"
              }`}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
