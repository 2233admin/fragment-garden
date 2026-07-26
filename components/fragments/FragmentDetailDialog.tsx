"use client";

import { useId, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  getFragmentDetailViewModel,
  type FragmentDetailViewModel,
} from "@/data/queries/fragment-detail-query";

import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog } from "../shared/ModalDialog";
import { FragmentDetailOverview } from "./FragmentDetailOverview";
import { FragmentEditForm } from "./FragmentEditForm";
import { FragmentLinkDetailPanel } from "./FragmentLinkDetailPanel";
import { FragmentNoteList } from "./FragmentNoteList";
import { ImageMediaPanel } from "./ImageMediaPanel";
import { MarkdownContent } from "./MarkdownContent";
import { SproutGenerationDialog } from "./SproutGenerationDialog";
import { TextSupplementForm } from "./TextSupplementForm";
import { VoiceMediaPanel } from "./VoiceMediaPanel";
import { useFragmentDetailActions } from "./useFragmentDetailActions";
import { useFragmentDispositionActions } from "./useFragmentDispositionActions";

type FragmentDetailDialogProps = {
  fragmentId: string;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onOpenRelatedFragment: (fragmentId: string) => Promise<boolean>;
  onStartProcessingJob: (jobId: string) => void;
  onRetryLinkImport?: (fragmentId: string) => Promise<void>;
};

type DetailQueryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; detail: FragmentDetailViewModel };

const LOADING_DETAIL_STATE: DetailQueryState = { status: "loading" };

export function FragmentDetailDialog({
  fragmentId,
  onClose,
  onDeleted,
  onOpenRelatedFragment,
  onStartProcessingJob,
}: FragmentDetailDialogProps) {
  const dialogTitleId = useId();
  const articleTitleId = useId();
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const stableFocusRef = useRef<HTMLParagraphElement>(null);
  const addNoteSectionRef = useRef<HTMLDivElement>(null);
  const sproutTriggerRef = useRef<HTMLButtonElement>(null);

  const detailState: DetailQueryState = useLiveQuery(
    async (): Promise<DetailQueryState> => {
      try {
        const detail = await getFragmentDetailViewModel(fragmentId);
        return detail === undefined ? { status: "missing" } : { status: "ready", detail };
      } catch {
        return { status: "error" };
      }
    },
    [fragmentId, queryAttempt],
    LOADING_DETAIL_STATE,
  );

  function requestStableFocus(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => stableFocusRef.current?.focus());
    });
  }

  const actions = useFragmentDetailActions({
    fragmentId,
    onOpenRelatedFragment,
    onRequestStableFocus: requestStableFocus,
  });
  const disposition = useFragmentDispositionActions({
    fragmentId,
    onArchived: () => undefined,
    onDeleted,
  });
  const isBusy = actions.isBusy || disposition.isBusy;
  const detail = detailState.status === "ready" ? detailState.detail : null;
  const isDeleted = detail?.fragment.lifecycleStatus === "deleted";

  function openNoteComposer(): void {
    if (isBusy || isDeleted) {
      return;
    }

    setIsAddingNote(true);
    requestAnimationFrame(() => {
      addNoteSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function closeSproutAndRestoreFocus(): void {
    actions.closeOverlay();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => sproutTriggerRef.current?.focus());
    });
  }

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[94vh] w-[min(94vw,64rem)] overflow-hidden rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
        isOpen
        isPending={isBusy}
        labelledBy={dialogTitleId}
        onRequestClose={onClose}
      >
        <div className="flex max-h-[94vh] min-h-[34rem] flex-col">
          <header className="z-10 flex shrink-0 items-center justify-between gap-4 border-b border-garden-line bg-garden-paper px-5 py-3 sm:px-8">
            <h2 className="sr-only" id={dialogTitleId}>
              {detail?.fragment.title ?? "笔记详情"}
            </h2>
            <button
              className="rounded-md px-3 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
              disabled={isBusy}
              onClick={onClose}
              type="button"
            >
              返回
            </button>

            {detail !== null ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {detail.fragment.contentType === "link" && detail.fragment.sourceUrl !== null ? (
                  <a
                    className="rounded-md border border-garden-line px-3 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
                    href={detail.fragment.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    打开原链接
                  </a>
                ) : null}
                {!isEditing ? (
                  <button
                    className="rounded-md border border-garden-line px-3 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                    disabled={isBusy || isDeleted}
                    onClick={() => {
                      setIsAddingNote(false);
                      setIsEditing(true);
                    }}
                    type="button"
                  >
                    编辑
                  </button>
                ) : null}
                <button
                  className="rounded-md px-3 py-2 text-sm font-semibold text-garden-danger hover:bg-garden-danger-soft disabled:opacity-50"
                  disabled={isBusy || isDeleted}
                  onClick={() => {
                    disposition.clearErrors();
                    actions.openOverlay("delete_confirm");
                  }}
                  type="button"
                >
                  删除
                </button>
              </div>
            ) : null}
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
            {detailState.status === "loading" ? (
              <div aria-live="polite" className="py-16 text-center">
                <p className="text-sm font-semibold text-garden-ink">正在读取笔记…</p>
              </div>
            ) : null}

            {detailState.status === "error" ? (
              <section aria-live="assertive" className="mx-auto max-w-xl py-14" role="alert">
                <h3 className="font-display text-xl font-semibold text-garden-danger">
                  无法读取这条笔记
                </h3>
                <p className="mt-2 text-sm leading-7 text-garden-muted">
                  本地内容没有被修改。可以重新读取，或返回后再试。
                </p>
                <button
                  className="mt-5 rounded-md border border-garden-danger px-4 py-2 text-sm font-semibold text-garden-danger"
                  onClick={() => setQueryAttempt((attempt) => attempt + 1)}
                  type="button"
                >
                  重新读取
                </button>
              </section>
            ) : null}

            {detailState.status === "missing" ? (
              <section aria-live="assertive" className="mx-auto max-w-xl py-14" role="alert">
                <h3 className="font-display text-xl font-semibold text-garden-danger">
                  这条笔记已经无法找到
                </h3>
                <p className="mt-2 text-sm leading-7 text-garden-muted">
                  没有数据被修改。请返回并重新选择。
                </p>
              </section>
            ) : null}

            {detail !== null ? (
              <article className="mx-auto max-w-[47rem]" key={detail.fragment.id}>
                {isEditing ? (
                  <FragmentEditForm
                    contentType={detail.fragment.contentType}
                    fragmentId={fragmentId}
                    initialContentMarkdown={detail.contentMarkdown}
                    initialTitle={detail.fragment.title}
                    isDisabled={isBusy}
                    onCancel={() => setIsEditing(false)}
                    onPendingChange={(isPending) =>
                      actions.handleFormPendingChange("edit", isPending)
                    }
                    onSaved={(message) => {
                      setIsEditing(false);
                      actions.setFeedback({ kind: "status", message });
                      requestStableFocus();
                    }}
                  />
                ) : (
                  <div className="space-y-8">
                    <FragmentDetailOverview
                      detail={detail}
                      onOpenRelatedFragment={onOpenRelatedFragment}
                      titleId={articleTitleId}
                    />

                    {detail.fragment.contentType === "link" ? (
                      <FragmentLinkDetailPanel fragment={detail.fragment} />
                    ) : null}

                    {detail.fragment.contentType === "image" &&
                    detail.mediaAsset?.kind === "image" ? (
                      <ImageMediaPanel fragment={detail.fragment} mediaAsset={detail.mediaAsset} />
                    ) : null}

                    {detail.fragment.contentType === "audio" &&
                    detail.mediaAsset?.kind === "audio" ? (
                      <VoiceMediaPanel fragment={detail.fragment} mediaAsset={detail.mediaAsset} />
                    ) : null}

                    {detail.fragment.contentType !== "audio" ? (
                      <section aria-labelledby={`body-title-${detail.fragment.id}`}>
                        <h3 className="sr-only" id={`body-title-${detail.fragment.id}`}>
                          笔记正文
                        </h3>
                        <MarkdownContent content={detail.contentMarkdown} />
                      </section>
                    ) : null}

                    <FragmentNoteList
                      isDisabled={isBusy || isDeleted}
                      notes={detail.notes}
                      onFeedback={(message, kind) => {
                        actions.setFeedback({ kind, message });
                        requestStableFocus();
                      }}
                      onPendingChange={(isPending) =>
                        actions.handleFormPendingChange("supplement", isPending)
                      }
                    />

                    {isAddingNote && !isDeleted ? (
                      <div ref={addNoteSectionRef}>
                        <TextSupplementForm
                          fragmentId={fragmentId}
                          isDisabled={isBusy}
                          onCancel={() => setIsAddingNote(false)}
                          onPendingChange={(isPending) =>
                            actions.handleFormPendingChange("supplement", isPending)
                          }
                          onSaved={(message) => {
                            setIsAddingNote(false);
                            actions.setFeedback({ kind: "status", message });
                            requestStableFocus();
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                )}

                <p
                  aria-atomic="true"
                  aria-live={actions.feedback?.kind === "error" ? "assertive" : "polite"}
                  className={`mt-6 min-h-6 text-sm font-semibold ${
                    actions.feedback?.kind === "error" ? "text-garden-danger" : "text-garden-accent"
                  }`}
                  ref={stableFocusRef}
                  role={actions.feedback?.kind === "error" ? "alert" : "status"}
                  tabIndex={-1}
                >
                  {actions.feedback?.message}
                </p>
              </article>
            ) : null}
          </div>

          {detail !== null && !isEditing && !isDeleted ? (
            <footer className="z-10 shrink-0 border-t border-garden-line bg-garden-paper/98 px-5 py-3 sm:px-8">
              <div className="mx-auto flex max-w-[47rem] items-center justify-end gap-3">
                <button
                  className="rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                  disabled={isBusy}
                  onClick={openNoteComposer}
                  type="button"
                >
                  追加笔记
                </button>
                <button
                  className="rounded-md bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                  disabled={isBusy}
                  onClick={() => actions.openOverlay("sprout")}
                  ref={sproutTriggerRef}
                  type="button"
                >
                  发芽
                </button>
              </div>
            </footer>
          ) : null}
        </div>
      </ModalDialog>

      {actions.activeOverlay === "sprout" && detail !== null && !isDeleted ? (
        <SproutGenerationDialog
          detail={detail}
          onClose={closeSproutAndRestoreFocus}
          onOpenCreatedFragment={onOpenRelatedFragment}
          onStartProcessingJob={onStartProcessingJob}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="确认删除"
        description="确认后，这条笔记不会再出现在普通卡片和花园中。"
        errorMessage={disposition.deleteError}
        isOpen={actions.activeOverlay === "delete_confirm"}
        isPending={disposition.isDirectDeletePending}
        onCancel={() => {
          disposition.clearErrors();
          actions.closeOverlay();
        }}
        onConfirm={() => void disposition.deleteFragment()}
        pendingLabel="正在删除…"
        title="删除这条笔记？"
      />
    </>
  );
}
