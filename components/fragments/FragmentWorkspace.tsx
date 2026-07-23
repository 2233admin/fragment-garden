"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  filterAndSortFragmentCards,
  listFragmentCardViewModels,
  type FragmentCardSort,
  type FragmentCardViewModel,
} from "@/data/queries/fragment-card-query";
import { recordFragmentViewed } from "@/services/record-fragment-viewed";

import { CreateTextFragmentDialog } from "./CreateTextFragmentDialog";
import { EmptyFragmentState } from "./EmptyFragmentState";
import { FragmentDetailDialog } from "./FragmentDetailDialog";
import { FragmentList } from "./FragmentList";
import { FragmentSearchBar } from "./FragmentSearchBar";

type CardQueryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; cards: FragmentCardViewModel[] };

const LOADING_CARD_STATE: CardQueryState = { status: "loading" };

type FragmentWorkspaceProps = {
  layout?: "page" | "embedded";
};

export function FragmentWorkspace({ layout = "page" }: FragmentWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<FragmentCardSort>("created_desc");
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null);
  const [openingFragmentId, setOpeningFragmentId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const seedButtonRef = useRef<HTMLButtonElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openingLockRef = useRef<string | null>(null);

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

  const visibleCards =
    cardState.status === "ready"
      ? filterAndSortFragmentCards(cardState.cards, searchTerm, sort)
      : [];

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
    setActionError(null);
    setFeedback(null);
    setIsCreateOpen(true);
  }

  function closeCreateDialog(): void {
    setIsCreateOpen(false);
    restoreFocus(createTriggerRef.current);
  }

  async function openFragment(
    fragmentId: string,
    triggerElement: HTMLButtonElement,
  ): Promise<void> {
    if (openingLockRef.current !== null) {
      return;
    }

    openingLockRef.current = fragmentId;
    detailTriggerRef.current = triggerElement;
    setOpeningFragmentId(fragmentId);
    setActionError(null);
    setFeedback(null);

    try {
      await recordFragmentViewed({ fragmentId });
      setSelectedFragmentId(fragmentId);
    } catch {
      setActionError("详情打开失败，没有写入查看记录，也没有修改本地内容。请重试。");
    } finally {
      openingLockRef.current = null;
      setOpeningFragmentId(null);
    }
  }

  function closeDetailDialog(): void {
    setSelectedFragmentId(null);
    restoreFocus(detailTriggerRef.current);
  }

  function handleDeleted(message: string): void {
    setSelectedFragmentId(null);
    setFeedback(message);
    restoreFocus(detailTriggerRef.current);
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
              {layout === "page" ? "碎片花园" : "文字碎片"}
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
                我的文字碎片
              </CollectionHeading>
              <p className="mt-1 text-sm text-garden-muted">
                {cardState.status === "ready"
                  ? `共 ${cardState.cards.length} 条未删除碎片`
                  : "正在连接本地花园"}
              </p>
            </div>
            <p className="text-xs text-garden-muted">本地保存 · 无需等待 AI</p>
          </div>

          <div className="mt-5">
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

          {actionError !== null ? (
            <p
              aria-live="assertive"
              className="mb-5 rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
              role="alert"
            >
              {actionError}
            </p>
          ) : null}

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
              onOpen={(fragmentId, triggerElement) => void openFragment(fragmentId, triggerElement)}
              openingFragmentId={openingFragmentId}
            />
          ) : null}
        </section>
      </div>

      <CreateTextFragmentDialog
        isOpen={isCreateOpen}
        onClose={closeCreateDialog}
        onCreated={(title) => setFeedback(`“${title}”已保存，并出现在卡片列表中。`)}
      />

      {selectedFragmentId !== null ? (
        <FragmentDetailDialog
          fragmentId={selectedFragmentId}
          onClose={closeDetailDialog}
          onDeleted={handleDeleted}
        />
      ) : null}
    </WorkspaceRoot>
  );
}
