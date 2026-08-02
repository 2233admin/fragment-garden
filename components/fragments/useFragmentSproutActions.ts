"use client";

import { useRef, useState } from "react";

import type { FragmentDetailViewModel } from "@/data/queries/fragment-detail-query";
import { isSproutRecommendedActionAllowed } from "@/domain/sprout/recommended-actions";
import type { SproutRecommendedAction } from "@/validation/sprout-api";

import type { FragmentDetailOverlay } from "./useFragmentDetailActions";

type UseFragmentSproutActionsInput = {
  detail: FragmentDetailViewModel | null;
  onCloseOverlay: () => void;
  onOpenOverlay: (overlay: Exclude<FragmentDetailOverlay, null>) => void;
};

export function useFragmentSproutActions({
  detail,
  onCloseOverlay,
  onOpenOverlay,
}: UseFragmentSproutActionsInput) {
  const [supplementIntent, setSupplementIntent] = useState<"next_step" | "supplement">(
    "supplement",
  );
  const sproutTriggerRef = useRef<HTMLButtonElement>(null);
  const supplementTextareaRef = useRef<HTMLTextAreaElement>(null);

  function focusAfterOverlayCloses(element: HTMLElement | null): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => element?.focus());
    });
  }

  function closeAndRestoreFocus(): void {
    onCloseOverlay();
    focusAfterOverlayCloses(sproutTriggerRef.current);
  }

  function continueFromSuggestion(action: SproutRecommendedAction): void {
    if (
      detail === null ||
      !isSproutRecommendedActionAllowed(action, {
        completionStatus: detail.fragment.completionStatus,
        lifecycleStatus: detail.fragment.lifecycleStatus,
      })
    ) {
      return;
    }

    if (action === "add_content" || action === "record_next_step") {
      setSupplementIntent(action === "record_next_step" ? "next_step" : "supplement");
      onCloseOverlay();
      focusAfterOverlayCloses(supplementTextareaRef.current);
    } else if (action === "grow_new_idea") {
      onOpenOverlay("create_child");
    } else if (action === "mark_completed") {
      onOpenOverlay("completion");
    } else {
      closeAndRestoreFocus();
    }
  }

  return {
    closeAndRestoreFocus,
    continueFromSuggestion,
    resetSupplementIntent: () => setSupplementIntent("supplement"),
    sproutTriggerRef,
    supplementIntent,
    supplementTextareaRef,
  };
}
