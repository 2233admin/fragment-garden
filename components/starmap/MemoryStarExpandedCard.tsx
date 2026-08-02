"use client";

import { Minimize2, Trash2, X } from "lucide-react";
import { forwardRef, useId, useRef, useState, type CSSProperties } from "react";

import type { MemoryStarDetailViewModel } from "@/data/queries/memory-star-detail-query";
import { softDeleteFragment } from "@/services/soft-delete-fragment";

import { FragmentNoteList } from "../fragments/FragmentNoteList";
import { ImageMediaPanel } from "../fragments/ImageMediaPanel";
import { MarkdownContent } from "../fragments/MarkdownContent";
import { TextSupplementForm } from "../fragments/TextSupplementForm";
import { VoiceMediaPanel } from "../fragments/VoiceMediaPanel";
import { formatFragmentTimestamp } from "../fragments/fragment-presenters";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog } from "../shared/ModalDialog";
import type { MemoryStarDetailStatus } from "./MemoryStarCompactCard";
import type { MemoryStarDetailRect } from "./memory-star-detail-layout";
import { isMemoryStarTitleVisuallyRedundant } from "./memory-star-detail-presentation";

type MemoryStarExpandedCardProps = Readonly<{
  detail: MemoryStarDetailViewModel | null;
  fragmentId: string;
  layout: MemoryStarDetailRect;
  onClose: () => void;
  onCollapse: () => void;
  onRetry: () => void;
  shouldSkipEnterAnimation: boolean;
  status: MemoryStarDetailStatus;
}>;

type DetailFeedback = Readonly<{
  kind: "status" | "error";
  message: string;
}>;

function resolveSafeSourceUrl(sourceUrl: string | null): string | null {
  if (sourceUrl === null) return null;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export const MemoryStarExpandedCard = forwardRef<HTMLElement, MemoryStarExpandedCardProps>(
  function MemoryStarExpandedCard(
    { detail, fragmentId, layout, onClose, onCollapse, onRetry, shouldSkipEnterAnimation, status },
    forwardedRef,
  ) {
    const panelTitleId = useId();
    const feedbackRef = useRef<HTMLParagraphElement>(null);
    const noteComposerRef = useRef<HTMLDivElement>(null);
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<DetailFeedback | null>(null);
    const isDeleted = detail?.fragment.lifecycleStatus === "deleted";
    const safeSourceUrl = resolveSafeSourceUrl(detail?.fragment.sourceUrl ?? null);
    const hasOpenEditor = isAddingNote || isEditingNote;

    function focusFeedback(): void {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => feedbackRef.current?.focus());
      });
    }

    function openNoteComposer(): void {
      if (isBusy || isDeleting || isDeleted || hasOpenEditor) return;
      setFeedback(null);
      setIsAddingNote(true);
      requestAnimationFrame(() => {
        noteComposerRef.current?.scrollIntoView({ behavior: "auto", block: "center" });
      });
    }

    async function deleteRecord(): Promise<void> {
      if (isDeleting) return;
      setDeleteError(null);
      setIsDeleting(true);

      try {
        await softDeleteFragment({ fragmentId });
        onClose();
      } catch {
        setDeleteError("删除失败，没有产生部分更新。这条记录仍然保留，可以重试。");
        setIsDeleting(false);
      }
    }

    const isTitleVisuallyRedundant =
      detail !== null &&
      isMemoryStarTitleVisuallyRedundant(
        detail.fragment.contentType,
        detail.fragment.title,
        detail.contentMarkdown,
      );
    const dialogStyle: CSSProperties = {
      height: layout.height,
      width: layout.width,
    };

    return (
      <>
        <ModalDialog
          appearance="starmap"
          className={`memory-dialog--inspection memory-star-detail-surface memory-star-detail-dialog m-auto overflow-hidden p-0${
            shouldSkipEnterAnimation ? " memory-star-detail-dialog--handoff" : ""
          }`}
          isOpen
          isPending={isBusy || isDeleting || hasOpenEditor}
          labelledBy={panelTitleId}
          onRequestClose={onClose}
          style={dialogStyle}
        >
          <aside className="memory-star-detail-dialog-content" ref={forwardedRef}>
            <header className="memory-star-detail-dialog-header">
              <div className="memory-star-detail-dialog-heading">
                <div className="memory-star-detail-dialog-meta">
                  <span>记忆记录</span>
                  {detail !== null ? (
                    <time dateTime={detail.fragment.createdAt}>
                      {formatFragmentTimestamp(detail.fragment.createdAt)}
                    </time>
                  ) : null}
                </div>
                <h2 className={isTitleVisuallyRedundant ? "sr-only" : undefined} id={panelTitleId}>
                  {detail?.fragment.title ?? "笔记详情"}
                </h2>
              </div>
              <div className="memory-star-detail-dialog-actions">
                {detail !== null && !isDeleted ? (
                  <button
                    aria-label="删除记录"
                    className="memory-star-detail-icon-button memory-star-detail-icon-button--danger"
                    data-tooltip={hasOpenEditor ? "请先保存或取消编辑" : "删除记录"}
                    disabled={isBusy || isDeleting || hasOpenEditor}
                    onClick={() => {
                      setDeleteError(null);
                      setIsDeleteConfirmOpen(true);
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} strokeWidth={1.7} />
                  </button>
                ) : null}
                <button
                  aria-label="收起详情"
                  autoFocus
                  className="memory-star-detail-icon-button"
                  data-tooltip={hasOpenEditor ? "请先保存或取消编辑" : "收起详情"}
                  disabled={isBusy || isDeleting || hasOpenEditor}
                  onClick={onCollapse}
                  type="button"
                >
                  <Minimize2 aria-hidden="true" size={16} strokeWidth={1.7} />
                </button>
                <button
                  aria-label="关闭详情"
                  className="memory-star-detail-icon-button"
                  data-tooltip={hasOpenEditor ? "请先保存或取消编辑" : "关闭详情"}
                  disabled={isBusy || isDeleting || hasOpenEditor}
                  onClick={onClose}
                  type="button"
                >
                  <X aria-hidden="true" size={17} strokeWidth={1.7} />
                </button>
              </div>
            </header>

            <div className="memory-star-detail-body">
              {status === "loading" ? (
                <div aria-live="polite" className="memory-star-detail-full-state" role="status">
                  <p>正在读取这颗星的记忆</p>
                </div>
              ) : null}

              {status === "error" ? (
                <section
                  aria-live="assertive"
                  className="memory-star-detail-full-state"
                  role="alert"
                >
                  <h3>无法读取这条笔记</h3>
                  <p>本地内容没有被修改。可以重新读取，或关闭后再试。</p>
                  <button onClick={onRetry} type="button">
                    重新读取
                  </button>
                </section>
              ) : null}

              {status === "missing" ? (
                <section
                  aria-live="assertive"
                  className="memory-star-detail-full-state"
                  role="alert"
                >
                  <h3>这条笔记已经无法找到</h3>
                  <p>没有数据被修改。请关闭详情并重新选择一颗星。</p>
                </section>
              ) : null}

              {detail !== null ? (
                <article className="memory-star-detail-article" key={detail.fragment.id}>
                  {detail.fragment.contentType === "link" ? (
                    <section aria-labelledby={`star-source-${detail.fragment.id}`}>
                      <h3
                        className="memory-star-detail-section-title"
                        id={`star-source-${detail.fragment.id}`}
                      >
                        原链接
                      </h3>
                      {safeSourceUrl !== null ? (
                        <a
                          className="memory-star-detail-source-link"
                          href={safeSourceUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {safeSourceUrl}
                        </a>
                      ) : (
                        <p className="text-sm leading-7 text-garden-muted">
                          原链接暂时无法读取，已保存的笔记正文仍可查看。
                        </p>
                      )}
                    </section>
                  ) : null}

                  {detail.fragment.contentType === "image" &&
                  detail.mediaAsset?.kind === "image" ? (
                    <ImageMediaPanel
                      dialogAppearance="starmap"
                      fragment={detail.fragment}
                      mediaAsset={detail.mediaAsset}
                    />
                  ) : null}

                  {detail.fragment.contentType === "audio" &&
                  detail.mediaAsset?.kind === "audio" ? (
                    <VoiceMediaPanel fragment={detail.fragment} mediaAsset={detail.mediaAsset} />
                  ) : null}

                  {detail.fragment.contentType !== "audio" ? (
                    <section aria-labelledby={`star-body-${detail.fragment.id}`}>
                      <h3 className="sr-only" id={`star-body-${detail.fragment.id}`}>
                        笔记正文
                      </h3>
                      <MarkdownContent content={detail.contentMarkdown} />
                    </section>
                  ) : null}

                  <FragmentNoteList
                    dialogAppearance="starmap"
                    isDisabled={isBusy || isDeleting || isDeleted || isAddingNote}
                    notes={detail.notes}
                    onEditingChange={setIsEditingNote}
                    onFeedback={(message, kind) => {
                      setFeedback({ kind, message });
                      focusFeedback();
                    }}
                    onPendingChange={setIsBusy}
                    presentation="continuation"
                  />

                  {isAddingNote && !isDeleted ? (
                    <div ref={noteComposerRef}>
                      <TextSupplementForm
                        fragmentId={fragmentId}
                        isDisabled={isBusy || isDeleting}
                        onCancel={() => setIsAddingNote(false)}
                        onPendingChange={setIsBusy}
                        onSaved={(message) => {
                          setIsAddingNote(false);
                          setFeedback({ kind: "status", message });
                          focusFeedback();
                        }}
                      />
                    </div>
                  ) : null}

                  <p
                    aria-atomic="true"
                    aria-live={feedback?.kind === "error" ? "assertive" : "polite"}
                    className={`memory-star-detail-feedback memory-star-detail-feedback--${feedback?.kind ?? "idle"}`}
                    ref={feedbackRef}
                    role={feedback?.kind === "error" ? "alert" : "status"}
                    tabIndex={-1}
                  >
                    {feedback?.message}
                  </p>
                </article>
              ) : null}
            </div>

            {detail !== null && !isDeleted ? (
              <footer className="memory-star-detail-dialog-footer">
                <button
                  className="memory-star-detail-primary-button"
                  disabled={isBusy || hasOpenEditor || isDeleting}
                  onClick={openNoteComposer}
                  type="button"
                >
                  追加笔记
                </button>
              </footer>
            ) : null}
          </aside>
        </ModalDialog>

        <ConfirmDialog
          appearance="starmap"
          confirmLabel="删除记录"
          description="删除后，这条记录和对应的记忆星会从主视图移除。数据采用软删除，不会伪装成未发生过。"
          errorMessage={deleteError}
          isOpen={isDeleteConfirmOpen}
          isPending={isDeleting}
          onCancel={() => {
            if (isDeleting) return;
            setDeleteError(null);
            setIsDeleteConfirmOpen(false);
          }}
          onConfirm={() => void deleteRecord()}
          pendingLabel="正在删除"
          title="删除这条记录？"
        />
      </>
    );
  },
);
