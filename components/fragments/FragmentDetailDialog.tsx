"use client";

import { useId, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  getFragmentDetailViewModel,
  type FragmentDetailViewModel,
} from "@/data/queries/fragment-detail-query";

import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog } from "../shared/ModalDialog";
import { CompleteFragmentDialog } from "./CompleteFragmentDialog";
import { CreateChildFragmentDialog } from "./CreateChildFragmentDialog";
import { FragmentDetailOverview } from "./FragmentDetailOverview";
import { FragmentDispositionDialog } from "./FragmentDispositionDialog";
import { FragmentEditForm } from "./FragmentEditForm";
import { FragmentLifecyclePanel } from "./FragmentLifecyclePanel";
import { TextSupplementForm } from "./TextSupplementForm";
import { useFragmentDetailActions } from "./useFragmentDetailActions";
import { useFragmentDispositionActions } from "./useFragmentDispositionActions";

type FragmentDetailDialogProps = {
  fragmentId: string;
  onClose: () => void;
  onDeleted: (message: string) => void;
  onOpenRelatedFragment: (fragmentId: string) => Promise<boolean>;
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
}: FragmentDetailDialogProps) {
  const titleId = useId();
  const [queryAttempt, setQueryAttempt] = useState(0);
  const stableFocusRef = useRef<HTMLParagraphElement>(null);

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
      requestAnimationFrame(() => {
        stableFocusRef.current?.focus();
      });
    });
  }

  const actions = useFragmentDetailActions({
    fragmentId,
    onOpenRelatedFragment,
    onRequestStableFocus: requestStableFocus,
  });
  const disposition = useFragmentDispositionActions({
    fragmentId,
    onArchived: (message) => {
      actions.setFeedback({ kind: "status", message });
      actions.closeOverlay();
      requestStableFocus();
    },
    onDeleted,
  });
  const isBusy = actions.isBusy || disposition.isBusy;
  const dialogTitle =
    detailState.status === "ready" ? detailState.detail.fragment.title : "碎片详情";

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[94vh] w-[min(94vw,58rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
        isOpen
        isPending={isBusy}
        labelledBy={titleId}
        onRequestClose={onClose}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-garden-line bg-garden-paper/95 px-6 py-5 backdrop-blur-sm sm:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
              碎片详情
            </p>
            <h2
              className="mt-1 truncate font-display text-2xl font-semibold text-garden-ink sm:text-3xl"
              id={titleId}
            >
              {dialogTitle}
            </h2>
          </div>
          <button
            aria-label="关闭详情"
            className="shrink-0 rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </header>

        <div className="px-6 py-6 sm:px-8">
          {detailState.status === "loading" ? (
            <div aria-live="polite" className="py-16 text-center">
              <p className="text-sm font-semibold text-garden-ink">正在读取碎片…</p>
              <p className="mt-2 text-sm text-garden-muted">本地内容正在准备中。</p>
            </div>
          ) : null}

          {detailState.status === "error" ? (
            <section
              aria-live="assertive"
              className="rounded-2xl bg-garden-danger-soft p-5"
              role="alert"
            >
              <h3 className="font-semibold text-garden-danger">无法读取碎片详情</h3>
              <p className="mt-2 text-sm leading-6 text-garden-danger">
                本地数据没有被修改。请重新读取；如果仍然失败，可以关闭后再试。
              </p>
              <button
                className="mt-4 rounded-full border border-garden-danger px-4 py-2 text-sm font-semibold text-garden-danger"
                onClick={() => setQueryAttempt((attempt) => attempt + 1)}
                type="button"
              >
                重新读取
              </button>
            </section>
          ) : null}

          {detailState.status === "missing" ? (
            <section
              aria-live="assertive"
              className="rounded-2xl bg-garden-danger-soft p-5 text-sm leading-6 text-garden-danger"
              role="alert"
            >
              这条碎片已无法找到，没有数据被修改。请关闭详情并重新选择。
            </section>
          ) : null}

          {detailState.status === "ready" ? (
            <div className="space-y-6" key={detailState.detail.fragment.id}>
              <FragmentDetailOverview detail={detailState.detail} />

              <div>
                <p
                  aria-atomic="true"
                  aria-live={actions.feedback?.kind === "error" ? "assertive" : "polite"}
                  className={`min-h-6 text-sm font-semibold ${
                    actions.feedback?.kind === "error" ? "text-garden-danger" : "text-garden-accent"
                  }`}
                  ref={stableFocusRef}
                  role={actions.feedback?.kind === "error" ? "alert" : "status"}
                  tabIndex={-1}
                >
                  {actions.feedback?.message}
                </p>

                {actions.createdChild !== null ? (
                  <button
                    aria-busy={actions.isOpeningRelated}
                    className="mt-2 rounded-full border border-garden-accent px-4 py-2 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-60"
                    disabled={isBusy}
                    onClick={() => void actions.openCreatedChild()}
                    type="button"
                  >
                    {actions.isOpeningRelated ? "正在打开新想法…" : "打开新想法"}
                  </button>
                ) : null}
              </div>

              <FragmentLifecyclePanel
                completionStatus={detailState.detail.fragment.completionStatus}
                isDisabled={isBusy}
                lifecycleStatus={detailState.detail.fragment.lifecycleStatus}
                onCreateChild={() => actions.openOverlay("create_child")}
                onOpenCompletion={() => actions.openOverlay("completion")}
                onOpenDisposition={() => {
                  disposition.clearErrors();
                  actions.openOverlay("disposition");
                }}
                onRestore={() => void actions.restore()}
                onReview={(decision) => void actions.review(decision)}
                pendingAction={actions.lifecyclePendingAction}
              />

              <TextSupplementForm
                fragmentId={fragmentId}
                isDisabled={isBusy}
                onPendingChange={(isPending) =>
                  actions.handleFormPendingChange("supplement", isPending)
                }
                onSaved={(message) => actions.setFeedback({ kind: "status", message })}
              />

              <FragmentEditForm
                fragmentId={fragmentId}
                initialRawText={detailState.detail.fragment.rawText ?? ""}
                initialTitle={detailState.detail.fragment.title}
                isDisabled={isBusy}
                onPendingChange={(isPending) => actions.handleFormPendingChange("edit", isPending)}
                onSaved={(message) => actions.setFeedback({ kind: "status", message })}
              />

              <section className="rounded-2xl border border-garden-danger/25 bg-garden-danger-soft/55 p-5">
                <h3 className="font-display text-xl font-semibold text-garden-danger">移除碎片</h3>
                <p className="mt-2 text-sm leading-6 text-garden-muted">
                  这是软删除。对应植物和本地记录会保留，但碎片不再出现在默认视图。
                </p>
                <button
                  className="mt-4 rounded-full border border-garden-danger px-5 py-2.5 text-sm font-semibold text-garden-danger hover:bg-garden-danger-soft disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => {
                    disposition.clearErrors();
                    actions.openOverlay("delete_confirm");
                  }}
                  type="button"
                >
                  删除碎片
                </button>
              </section>
            </div>
          ) : null}
        </div>
      </ModalDialog>

      <FragmentDispositionDialog
        errorMessage={disposition.dispositionError}
        isOpen={actions.activeOverlay === "disposition"}
        onArchive={() => void disposition.archiveFromDisposition()}
        onCancel={() => {
          disposition.clearErrors();
          actions.closeOverlay();
        }}
        onDelete={() => void disposition.deleteFragment("no_longer_needed")}
        pendingAction={disposition.dispositionPendingAction}
      />

      <CompleteFragmentDialog
        isOpen={actions.activeOverlay === "completion"}
        onClose={actions.closeOverlay}
        onComplete={actions.complete}
      />

      <CreateChildFragmentDialog
        isOpen={actions.activeOverlay === "create_child"}
        onClose={actions.closeOverlay}
        onCreate={actions.createChild}
      />

      <ConfirmDialog
        confirmLabel="确认删除"
        description="确认后，这条内容不会再出现在默认视图中。对应植物不会被物理删除，但会释放花园位置。"
        errorMessage={disposition.deleteError}
        isOpen={actions.activeOverlay === "delete_confirm"}
        isPending={disposition.isDirectDeletePending}
        onCancel={() => {
          disposition.clearErrors();
          actions.closeOverlay();
        }}
        onConfirm={() => void disposition.deleteFragment()}
        pendingLabel="正在删除…"
        title="确认删除碎片"
      />
    </>
  );
}
