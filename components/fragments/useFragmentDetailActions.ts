"use client";

import { useRef, useState } from "react";

import type { FragmentReviewDecision } from "@/domain";
import { completeFragment } from "@/services/complete-fragment";
import { createChildFragmentFromParent } from "@/services/create-child-fragment-from-parent";
import { restoreArchivedFragment } from "@/services/restore-archived-fragment";
import { reviewFragment } from "@/services/review-fragment";

import type { FragmentLifecyclePendingAction } from "./FragmentLifecyclePanel";

export type FragmentDetailOverlay =
  "disposition" | "completion" | "create_child" | "delete_confirm" | "sprout" | null;

type DetailPendingAction =
  | Exclude<FragmentLifecyclePendingAction, null>
  | "complete"
  | "create_child"
  | "edit"
  | "supplement"
  | null;

export type FragmentDetailFeedback = Readonly<{
  kind: "status" | "error";
  message: string;
}>;

type CreatedChild = Readonly<{
  id: string;
  title: string;
}>;

type UseFragmentDetailActionsOptions = {
  fragmentId: string;
  onOpenRelatedFragment: (fragmentId: string) => Promise<boolean>;
  onRequestStableFocus: () => void;
};

export function useFragmentDetailActions({
  fragmentId,
  onOpenRelatedFragment,
  onRequestStableFocus,
}: UseFragmentDetailActionsOptions) {
  const [activeOverlay, setActiveOverlay] = useState<FragmentDetailOverlay>(null);
  const [createdChild, setCreatedChild] = useState<CreatedChild | null>(null);
  const [feedback, setFeedback] = useState<FragmentDetailFeedback | null>(null);
  const [isOpeningRelated, setIsOpeningRelated] = useState(false);
  const [pendingAction, setPendingActionState] = useState<DetailPendingAction>(null);
  const mutationLockRef = useRef<DetailPendingAction>(null);
  const pendingActionRef = useRef<DetailPendingAction>(null);
  const relatedOpenLockRef = useRef(false);

  function setPendingAction(action: DetailPendingAction): void {
    pendingActionRef.current = action;
    setPendingActionState(action);
  }

  function beginMutation(action: Exclude<DetailPendingAction, null>): boolean {
    if (
      mutationLockRef.current !== null ||
      pendingActionRef.current !== null ||
      relatedOpenLockRef.current
    ) {
      return false;
    }

    mutationLockRef.current = action;
    setPendingAction(action);
    return true;
  }

  function finishMutation(action: Exclude<DetailPendingAction, null>): void {
    if (mutationLockRef.current === action) {
      mutationLockRef.current = null;
    }

    if (pendingActionRef.current === action) {
      setPendingAction(null);
    }
  }

  function openOverlay(overlay: Exclude<FragmentDetailOverlay, null>): void {
    if (pendingActionRef.current !== null || relatedOpenLockRef.current) {
      return;
    }

    setActiveOverlay(overlay);
  }

  function closeOverlay(): void {
    if (pendingActionRef.current !== null) {
      return;
    }

    setActiveOverlay(null);
  }

  function handleFormPendingChange(action: "edit" | "supplement", isPending: boolean): void {
    if (isPending) {
      if (pendingActionRef.current === null) {
        setPendingAction(action);
      }
      return;
    }

    if (pendingActionRef.current === action) {
      setPendingAction(null);
    }
  }

  async function review(
    decision: Exclude<FragmentReviewDecision, "no_longer_needed">,
  ): Promise<void> {
    const action =
      decision === "still_interested"
        ? ("review_still_interested" as const)
        : ("review_not_now" as const);

    if (!beginMutation(action)) {
      return;
    }

    try {
      await reviewFragment({
        decision,
        fragmentId,
        now: new Date().toISOString(),
      });
      setFeedback({
        kind: "status",
        message:
          decision === "still_interested"
            ? "已经记下，你以后还可以再回来看看。"
            : "它会先安静地休息，想起来时再来看就好。",
      });
    } catch {
      setFeedback({
        kind: "error",
        message: "这次复盘没有保存，也没有产生部分更新。请稍后重试。",
      });
    } finally {
      finishMutation(action);
    }
  }

  async function restore(): Promise<void> {
    const action = "restore";

    if (!beginMutation(action)) {
      return;
    }

    try {
      const result = await restoreArchivedFragment({
        fragmentId,
        now: new Date().toISOString(),
      });
      setFeedback({
        kind: "status",
        message:
          result.plant.slotId === null
            ? "内容已恢复，但花园位置已满，暂未放置。仍可在卡片模式继续使用。"
            : "内容已恢复到花园，并重新分配了种植位置。",
      });
      onRequestStableFocus();
    } catch {
      setFeedback({
        kind: "error",
        message: "恢复失败，没有产生部分更新。这条内容仍保留在已封存内容中。",
      });
    } finally {
      finishMutation(action);
    }
  }

  async function complete(outcome: string | null): Promise<void> {
    const action = "complete";

    if (!beginMutation(action)) {
      throw new Error("Another fragment action is already running");
    }

    try {
      await completeFragment({
        fragmentId,
        now: new Date().toISOString(),
        outcome,
      });
      setFeedback({
        kind: "status",
        message: "这条碎片已完成，这株植物会一直保持永久盛开。",
      });
      onRequestStableFocus();
    } finally {
      finishMutation(action);
    }
  }

  async function createChild(input: { rawText: string; title?: string }): Promise<void> {
    const action = "create_child";

    if (!beginMutation(action)) {
      throw new Error("Another fragment action is already running");
    }

    try {
      const result = await createChildFragmentFromParent({
        ...input,
        parentFragmentId: fragmentId,
        now: new Date().toISOString(),
      });
      setCreatedChild({
        id: result.childFragment.id,
        title: result.childFragment.title,
      });
      setFeedback({
        kind: "status",
        message: "新的想法已经种下，并保留了它从哪里生长而来。",
      });
    } finally {
      finishMutation(action);
    }
  }

  async function openCreatedChild(): Promise<void> {
    if (
      createdChild === null ||
      relatedOpenLockRef.current ||
      pendingActionRef.current !== null ||
      mutationLockRef.current !== null
    ) {
      return;
    }

    relatedOpenLockRef.current = true;
    setIsOpeningRelated(true);
    setFeedback({ kind: "status", message: "正在打开新想法…" });

    try {
      const didOpen = await onOpenRelatedFragment(createdChild.id);

      if (!didOpen) {
        setFeedback({
          kind: "error",
          message: "新想法暂时无法打开，它已经保存，仍可从卡片列表中找到。",
        });
      }
    } catch {
      setFeedback({
        kind: "error",
        message: "新想法暂时无法打开，它已经保存，仍可从卡片列表中找到。",
      });
    } finally {
      relatedOpenLockRef.current = false;
      setIsOpeningRelated(false);
    }
  }

  const lifecyclePendingAction: FragmentLifecyclePendingAction =
    pendingAction === "review_still_interested" ||
    pendingAction === "review_not_now" ||
    pendingAction === "restore"
      ? pendingAction
      : null;
  return {
    activeOverlay,
    closeOverlay,
    complete,
    createChild,
    createdChild,
    feedback,
    handleFormPendingChange,
    isBusy: pendingAction !== null || isOpeningRelated,
    isOpeningRelated,
    lifecyclePendingAction,
    openCreatedChild,
    openOverlay,
    review,
    restore,
    setFeedback,
  };
}
