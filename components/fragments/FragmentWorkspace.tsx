"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { filterFragmentCardsByStatus, type FragmentCardFilter } from "@/domain";
import {
  filterAndSortFragmentCards,
  listFragmentCardViewModels,
  type FragmentCardSort,
  type FragmentCardViewModel,
} from "@/data/queries/fragment-card-query";

import { CreateFragmentDialog } from "./CreateFragmentDialog";
import { EmptyFragmentState } from "./EmptyFragmentState";
import { FragmentList } from "./FragmentList";
import { FragmentSearchBar } from "./FragmentSearchBar";
import { FragmentStatusFilter } from "./FragmentStatusFilter";

type CardQueryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; cards: FragmentCardViewModel[] };

const LOADING_CARD_STATE: CardQueryState = { status: "loading" };

const FILTER_EMPTY_MESSAGES: Readonly<Record<FragmentCardFilter, string>> = {
  current: "当前没有可显示的碎片。已封存的内容仍可从“已封存”中找到。",
  dormant: "现在没有正在休眠的碎片。",
  completed: "现在还没有已完成的碎片。",
  archived: "现在还没有已封存的碎片。",
};

type FragmentWorkspaceProps = {
  layout?: "page" | "embedded";
  onOpenFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  openingFragmentId: string | null;
  onRetryLinkImport?: (fragmentId: string) => Promise<void>;
  onStartLinkImport?: (fragmentId: string) => void;
};

export function FragmentWorkspace({
  layout = "page",
  onOpenFragment,
  openingFragmentId,
  onRetryLinkImport,
  onStartLinkImport,
}: FragmentWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<FragmentCardSort>("created_desc");
  const [statusFilter, setStatusFilter] = useState<FragmentCardFilter>("current");
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const seedButtonRef = useRef<HTMLButtonElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);

  const cardState: CardQueryState = useLiveQuery(
    async (): Promise<CardQueryState> => {
      try {
        return {
          status: "ready",
          cards: await listFragmentCardViewModels(),
        };
      } catch {
        return { status: "error" };
      }
    },
    [queryAttempt],
    LOADING_CARD_STATE,
  );

  const statusFilteredCards =
    cardState.status === "ready" ? filterFragmentCardsByStatus(cardState.cards, statusFilter) : [];
  const visibleCards = filterAndSortFragmentCards(statusFilteredCards, searchTerm, sort);

  function restoreFocus(preferredTarget: HTMLButtonElement | null): void {
    requestAnimationFrame(() => {
      if (preferredTarget?.isConnected) {
        preferredTarget.focus();
      } else {
        seedButtonRef.current?.focus();
      }
    });
  }

  function openCreateDialog(triggerElement: HTMLButtonElement): void {
    createTriggerRef.current = triggerElement;
    setFeedback(null);
    setIsCreateOpen(true);
  }

  function closeCreateDialog(): void {
    setIsCreateOpen(false);
    restoreFocus(createTriggerRef.current);
  }

  const WorkspaceRoot = layout === "page" ? "main" : "div";
  const WorkspaceHeading = layout === "page" ? "h1" : "h2";
  const CollectionHeading = layout === "page" ? "h2" : "h3";

  return (
    <WorkspaceRoot
      className={
        layout === "page"
          ? "min-h-screen px-5 py-8 text-garden-ink sm:px-8 lg:px-12 lg:py-10"
          : "pt-7 pb-12 text-garden-ink"
      }
    >
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-6 border-b border-garden-line pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-garden-accent uppercase">
              卡片模式
            </p>
            <WorkspaceHeading className="mt-2 font-display text-4xl leading-tight font-semibold tracking-tight text-garden-ink sm:text-5xl">
              {layout === "page" ? "碎片花园" : "我的碎片"}
            </WorkspaceHeading>
            <p className="mt-3 max-w-xl text-sm leading-6 text-garden-muted sm:text-base">
              把暂时不处理、但也不想忘记的内容种下来。所有内容先保存在当前浏览器中。
            </p>
          </div>

          <button
            className="self-start rounded-full bg-garden-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(36,93,69,0.2)] hover:bg-garden-accent-strong sm:self-auto"
            onClick={(event) => openCreateDialog(event.currentTarget)}
            ref={seedButtonRef}
            type="button"
          >
            种下碎片
          </button>
        </header>

        <section className="mt-8" aria-labelledby="fragment-collection-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CollectionHeading
                className="font-display text-2xl font-semibold text-garden-ink"
                id="fragment-collection-title"
              >
                我的碎片
              </CollectionHeading>
              <p className="mt-1 text-sm text-garden-muted">
                {cardState.status === "ready"
                  ? `当前筛选 ${statusFilteredCards.length} 条，共 ${cardState.cards.length} 条未删除碎片`
                  : "正在连接本地花园"}
              </p>
            </div>
            <p className="text-xs text-garden-muted">本地保存 · 无需等待 AI</p>
          </div>

          <div className="mt-5 space-y-4">
            <FragmentStatusFilter onChange={setStatusFilter} value={statusFilter} />
            <FragmentSearchBar
              onSearchTermChange={setSearchTerm}
              onSortChange={setSort}
              searchTerm={searchTerm}
              sort={sort}
            />
          </div>

          <div
            aria-atomic="true"
            aria-live="polite"
            className="mt-4 min-h-6 text-sm font-semibold text-garden-accent"
            role="status"
          >
            {feedback}
          </div>

          {cardState.status === "loading" ? (
            <section
              aria-live="polite"
              className="rounded-2xl border border-garden-line bg-garden-paper px-6 py-14 text-center"
            >
              <h3 className="font-display text-xl font-semibold">正在初始化本地花园…</h3>
              <p className="mt-2 text-sm text-garden-muted">
                正在读取当前浏览器中的 IndexedDB 数据。
              </p>
            </section>
          ) : null}

          {cardState.status === "error" ? (
            <section
              aria-live="assertive"
              className="rounded-2xl bg-garden-danger-soft p-6"
              role="alert"
            >
              <h3 className="font-display text-xl font-semibold text-garden-danger">
                无法读取本地碎片
              </h3>
              <p className="mt-2 text-sm leading-6 text-garden-danger">
                没有数据被修改。请重新读取；如果仍然失败，可以刷新页面后重试。
              </p>
              <button
                className="mt-4 rounded-full border border-garden-danger px-5 py-2.5 text-sm font-semibold text-garden-danger"
                onClick={() => setQueryAttempt((attempt) => attempt + 1)}
                type="button"
              >
                重新读取
              </button>
            </section>
          ) : null}

          {cardState.status === "ready" && cardState.cards.length === 0 ? (
            <EmptyFragmentState onCreate={openCreateDialog} />
          ) : null}

          {cardState.status === "ready" &&
          cardState.cards.length > 0 &&
          statusFilteredCards.length === 0 ? (
            <section
              aria-live="polite"
              className="rounded-2xl border border-dashed border-garden-line bg-garden-paper/75 px-6 py-12 text-center"
            >
              <h3 className="font-display text-xl font-semibold">这个筛选里还没有内容</h3>
              <p className="mt-2 text-sm text-garden-muted">
                {FILTER_EMPTY_MESSAGES[statusFilter]}
              </p>
            </section>
          ) : null}

          {cardState.status === "ready" &&
          statusFilteredCards.length > 0 &&
          visibleCards.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-garden-line bg-garden-paper/75 px-6 py-12 text-center">
              <h3 className="font-display text-xl font-semibold">没有找到匹配的碎片</h3>
              <p className="mt-2 text-sm text-garden-muted">换一个标题或正文关键词试试。</p>
              <button
                className="mt-5 rounded-full border border-garden-accent px-5 py-2.5 text-sm font-semibold text-garden-accent"
                onClick={() => setSearchTerm("")}
                type="button"
              >
                清除搜索
              </button>
            </section>
          ) : null}

          {visibleCards.length > 0 ? (
            <FragmentList
              fragments={visibleCards}
              onOpen={onOpenFragment}
              openingFragmentId={openingFragmentId}
              onRetryLinkImport={onRetryLinkImport}
            />
          ) : null}
        </section>
      </div>

      <CreateFragmentDialog
        isOpen={isCreateOpen}
        onClose={closeCreateDialog}
        onCreated={(notice) => {
          if (notice.contentType !== "link") {
            setFeedback(`“${notice.title}”已保存，并出现在卡片列表中。`);
            return;
          }

          setFeedback(
            notice.linkImportStarted
              ? `“${notice.title}”链接已经种下，正在读取内容。`
              : `“${notice.title}”链接已保存到本地。读取暂时未启动，刷新页面后会继续恢复。`,
          );
        }}
        onOpenExistingFragment={onOpenFragment}
        onStartLinkImport={onStartLinkImport}
      />
    </WorkspaceRoot>
  );
}
