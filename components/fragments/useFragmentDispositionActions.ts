"use client";

import { useRef, useState } from "react";

import { archiveFragment } from "@/services/archive-fragment";
import { softDeleteFragment } from "@/services/soft-delete-fragment";

import type { FragmentDispositionPendingAction } from "./FragmentDispositionDialog";

type DispositionPendingAction = "archive" | "delete" | "disposition_delete" | null;

type UseFragmentDispositionActionsOptions = {
  fragmentId: string;
  onArchived: (message: string) => void;
  onDeleted: (message: string) => void;
};

export function useFragmentDispositionActions({
  fragmentId,
  onArchived,
  onDeleted,
}: UseFragmentDispositionActionsOptions) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<DispositionPendingAction>(null);
  const mutationLockRef = useRef<DispositionPendingAction>(null);

  function beginMutation(action: Exclude<DispositionPendingAction, null>): boolean {
    if (mutationLockRef.current !== null) {
      return false;
    }

    mutationLockRef.current = action;
    setPendingAction(action);
    return true;
  }

  function finishMutation(action: Exclude<DispositionPendingAction, null>): void {
    if (mutationLockRef.current === action) {
      mutationLockRef.current = null;
      setPendingAction(null);
    }
  }

  function clearErrors(): void {
    setDeleteError(null);
    setDispositionError(null);
  }

  async function archiveFromDisposition(): Promise<void> {
    const action = "archive";

    if (!beginMutation(action)) {
      return;
    }

    setDispositionError(null);

    try {
      await archiveFragment({
        fragmentId,
        now: new Date().toISOString(),
        reviewDecision: "no_longer_needed",
      });
      finishMutation(action);
      onArchived("这条碎片已封存，并离开主要花园。你仍可在已封存内容中找到它。");
    } catch {
      setDispositionError("封存失败，没有产生部分更新。这条碎片仍保持原来的状态。");
      finishMutation(action);
    }
  }

  async function deleteFragment(reviewDecision?: "no_longer_needed"): Promise<void> {
    const action = reviewDecision === undefined ? "delete" : "disposition_delete";

    if (!beginMutation(action)) {
      return;
    }

    if (reviewDecision === undefined) {
      setDeleteError(null);
    } else {
      setDispositionError(null);
    }

    try {
      await softDeleteFragment({
        fragmentId,
        ...(reviewDecision === undefined ? {} : { reviewDecision }),
      });
      finishMutation(action);
      onDeleted("碎片已移除，本地内容仍按软删除规则保留。");
    } catch {
      if (reviewDecision === undefined) {
        setDeleteError("删除失败，碎片仍保留在本地并继续显示。你可以重试。");
      } else {
        setDispositionError("删除失败，没有产生部分更新。这条碎片仍保持原来的状态。");
      }
      finishMutation(action);
    }
  }

  const dispositionPendingAction: FragmentDispositionPendingAction =
    pendingAction === "archive"
      ? "archive"
      : pendingAction === "disposition_delete"
        ? "delete"
        : null;

  return {
    archiveFromDisposition,
    clearErrors,
    deleteError,
    deleteFragment,
    dispositionError,
    dispositionPendingAction,
    isBusy: pendingAction !== null,
    isDirectDeletePending: pendingAction === "delete",
  };
}
