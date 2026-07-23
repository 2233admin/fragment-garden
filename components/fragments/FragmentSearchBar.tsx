import type { FragmentCardSort } from "@/data/queries/fragment-card-query";

type FragmentSearchBarProps = {
  onSearchTermChange: (value: string) => void;
  onSortChange: (value: FragmentCardSort) => void;
  searchTerm: string;
  sort: FragmentCardSort;
};

export function FragmentSearchBar({
  onSearchTermChange,
  onSortChange,
  searchTerm,
  sort,
}: FragmentSearchBarProps) {
  return (
    <div
      aria-label="查找和排列碎片"
      className="grid gap-4 rounded-2xl border border-garden-line bg-garden-paper p-4 shadow-[0_12px_36px_rgba(24,55,43,0.06)] md:grid-cols-[1fr_13rem]"
      role="search"
    >
      <div>
        <label
          className="mb-2 block text-xs font-semibold tracking-[0.12em] text-garden-muted uppercase"
          htmlFor="fragment-search"
        >
          搜索碎片
        </label>
        <input
          autoComplete="off"
          className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/70"
          id="fragment-search"
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="搜索标题或原始内容"
          type="search"
          value={searchTerm}
        />
      </div>

      <div>
        <label
          className="mb-2 block text-xs font-semibold tracking-[0.12em] text-garden-muted uppercase"
          htmlFor="fragment-sort"
        >
          排序方式
        </label>
        <select
          className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink"
          id="fragment-sort"
          onChange={(event) => onSortChange(event.target.value as FragmentCardSort)}
          value={sort}
        >
          <option value="created_desc">最近创建</option>
          <option value="created_asc">最早创建</option>
          <option value="interacted_desc">最近互动</option>
        </select>
      </div>
    </div>
  );
}
