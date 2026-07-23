"use client";

import { useId, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import {
  getFragmentDetailViewModel,
  type FragmentDetailViewModel,
} from "@/data/queries/fragment-detail-query";
import { softDeleteFragment } from "@/services/soft-delete-fragment";

import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog } from "../shared/ModalDialog";
import { FragmentDetailOverview } from "./FragmentDetailOverview";
import { FragmentEditForm } from "./FragmentEditForm";
import { TextSupplementForm } from "./TextSupplementForm";

type FragmentDetailDialogProps = {
  fragmentId: string;
  onClose: () => void;
  onDeleted: (message: string) => void;
};

type DetailQueryState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; detail: FragmentDetailViewModel };

type PendingAction = "edit" | "supplement" | "delete" | null;

const LOADING_DETAIL_STATE: DetailQueryState = { status: "loading" };

export function FragmentDetailDialog({
  fragmentId,
  onClose,
  onDeleted,
}: FragmentDetailDialogProps) {
  const titleId = useId();
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletionLockRef = useRef(false);

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

  const isBusy = pendingAction !== null;
  const dialogTitle =
    detailState.status === "ready" ? detailState.detail.fragment.title : "碎片详情";

  async function handleDelete(): Promise<void> {
    if (pendingAction !== null || deletionLockRef.current) {
      return;
    }

    deletionLockRef.current = true;
    setPendingAction("delete");
    setDeleteError(null);

    try {
      await softDeleteFragment({ fragmentId });
      deletionLockRef.current = false;
      setPendingAction(null);
      setIsDeleteConfirmOpen(false);
      onDeleted("碎片已移除，本地内容仍按软删除规则保留。");
    } catch {
      deletionLockRef.current = false;
      setPendingAction(null);
      setDeleteError("删除失败，碎片仍保留在本地并继续显示。你可以重试。");
    }
  }

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

              <p
                aria-atomic="true"
                aria-live="polite"
                className="min-h-6 text-sm font-semibold text-garden-accent"
                role="status"
              >
                {feedback}
              </p>

              <TextSupplementForm
                fragmentId={fragmentId}
                isDisabled={isBusy}
                onPendingChange={(isPending) => setPendingAction(isPending ? "supplement" : null)}
                onSaved={setFeedback}
              />

              <FragmentEditForm
                fragmentId={fragmentId}
                initialRawText={detailState.detail.fragment.rawText ?? ""}
                initialTitle={detailState.detail.fragment.title}
                isDisabled={isBusy}
                onPendingChange={(isPending) => setPendingAction(isPending ? "edit" : null)}
                onSaved={setFeedback}
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
                    setDeleteError(null);
                    setIsDeleteConfirmOpen(true);
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

      <ConfirmDialog
        confirmLabel="确认删除"
        description="确认后，这条内容不会再出现在默认视图中。对应植物不会被物理删除。"
        errorMessage={deleteError}
        isOpen={isDeleteConfirmOpen}
        isPending={pendingAction === "delete"}
        onCancel={() => {
          if (pendingAction !== "delete") {
            setDeleteError(null);
            setIsDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => void handleDelete()}
        pendingLabel="正在删除…"
        title="确认删除碎片"
      />
    </>
  );
}
