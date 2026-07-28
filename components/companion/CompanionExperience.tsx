"use client";

import { useEffect, useState, type RefObject } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type { CompanionType } from "@/domain";
import type { GardenSummary } from "@/domain/companion/context-builder";
import type { CompanionNpcScreen } from "@/domain/companion/npc";
import {
  getCurrentRecommendationView,
  type CurrentRecommendationView,
} from "@/data/queries/companion-query";
import {
  queryDormantFragmentList,
  type DormantFragmentList,
} from "@/data/queries/companion-npc-query";
import { completeCompanionOnboarding } from "@/services/complete-companion-onboarding";
import { dismissFragmentRecommendation } from "@/services/dismiss-fragment-recommendation";
import { openFragmentRecommendation } from "@/services/open-fragment-recommendation";
import { requestFragmentRecommendation } from "@/services/request-fragment-recommendation";

import { CompanionNpcDialog, type CompanionNpcRecommendationState } from "./CompanionNpcDialog";
import { CompanionOnboardingDialog } from "./CompanionOnboardingDialog";
import type {
  FragmentRecommendationView,
  RecommendationPendingAction,
} from "./FragmentRecommendationCard";
import { useCompanionSettings } from "./useCompanionData";

type CompanionExperienceProps = {
  /** Changes whenever garden data changes and keeps the NPC's read-only list fresh. */
  gardenRevision: string;
  gardenSummary: GardenSummary;
  gardenSummaryStatus: "loading" | "error" | "ready";
  companionOpenGeneration: number;
  preserveCompanionScreen: boolean;
  isChatOpen: boolean;
  triggerButtonRef: RefObject<HTMLButtonElement | null>;
  onChatOpenChange: (isOpen: boolean, options?: { preserveScreen?: boolean }) => void;
  onCompanionTypeChange: (companionType: CompanionType | null) => void;
  onOpenFragment: (
    fragmentId: string,
    triggerElement: HTMLButtonElement | null,
    viewAlreadyRecorded?: boolean,
    reopenCompanionOnClose?: boolean,
  ) => Promise<boolean>;
  onRequestCreateFragment: () => void;
};

type DormantQueryState =
  | { status: "loading"; value: DormantFragmentList }
  | { status: "ready"; value: DormantFragmentList }
  | { status: "error"; value: DormantFragmentList };

const EMPTY_DORMANT_LIST: DormantFragmentList = { items: [], remainingCount: 0 };
const LOADING_DORMANT_STATE: DormantQueryState = {
  status: "loading",
  value: EMPTY_DORMANT_LIST,
};
const RECOMMENDATION_QUERY_ERROR = "暂时没能找到适合回看的内容。你仍然可以在卡片模式中查找。";
const RECOMMENDATION_OPEN_ERROR = "暂时没能打开这条内容。";
const RECOMMENDATION_DISMISS_ERROR = "暂时没能保存这次选择，请重试。";

function createRecommendationView(current: CurrentRecommendationView): FragmentRecommendationView {
  const source = current.fragment.rawText ?? current.fragment.summary ?? "";
  const characters = Array.from(source.trim());
  const excerpt =
    characters.length > 96 ? `${characters.slice(0, 95).join("")}…` : characters.join("");

  return {
    id: current.recommendation.id,
    fragmentId: current.fragment.id,
    title: current.fragment.title || "未命名碎片",
    excerpt,
    lastInteractedAt: current.fragment.lastInteractedAt,
    statusLabel: current.fragment.lifecycleStatus === "dormant" ? "休眠" : "活跃",
  };
}

function waitForDialogTransition(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function CompanionExperience({
  gardenRevision,
  gardenSummary,
  gardenSummaryStatus,
  companionOpenGeneration,
  preserveCompanionScreen,
  isChatOpen,
  triggerButtonRef,
  onChatOpenChange,
  onCompanionTypeChange,
  onOpenFragment,
  onRequestCreateFragment,
}: CompanionExperienceProps) {
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [isChoosing, setIsChoosing] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [recommendationState, setRecommendationState] = useState<CompanionNpcRecommendationState>({
    status: "idle",
    recommendation: null,
  });
  const [recommendationPending, setRecommendationPending] =
    useState<RecommendationPendingAction>(null);
  const [dormantOpenError, setDormantOpenError] = useState<string | null>(null);
  const [dormantAttempt, setDormantAttempt] = useState(0);
  const settingsState = useCompanionSettings(settingsAttempt);
  const dormantState: DormantQueryState = useLiveQuery(
    async (): Promise<DormantQueryState> => {
      try {
        return { status: "ready", value: await queryDormantFragmentList() };
      } catch {
        return { status: "error", value: EMPTY_DORMANT_LIST };
      }
    },
    [dormantAttempt, gardenRevision],
    LOADING_DORMANT_STATE,
  );

  const companionType =
    settingsState.status === "ready" &&
    settingsState.value.onboardingCompleted &&
    settingsState.value.companionType !== null
      ? settingsState.value.companionType
      : null;

  useEffect(() => {
    onCompanionTypeChange(companionType);
  }, [companionType, onCompanionTypeChange]);

  useEffect(() => {
    if (isChatOpen) {
      return;
    }

    const companionButton = triggerButtonRef.current;
    requestAnimationFrame(() => companionButton?.focus());
  }, [isChatOpen, triggerButtonRef]);

  async function chooseCompanion(nextCompanionType: CompanionType): Promise<void> {
    if (isChoosing) {
      return;
    }

    setIsChoosing(true);
    setOnboardingError(null);
    try {
      await completeCompanionOnboarding({
        companionType: nextCompanionType,
        now: new Date().toISOString(),
      });
      setSettingsAttempt((attempt) => attempt + 1);
    } catch {
      setOnboardingError("伙伴选择暂时没有保存，请重试。");
    } finally {
      setIsChoosing(false);
    }
  }

  async function requestRecommendation(): Promise<void> {
    if (recommendationState.status === "loading" || recommendationPending !== null) {
      return;
    }

    setRecommendationState({ status: "loading", recommendation: null });
    try {
      const current = await getCurrentRecommendationView();
      const result =
        current ?? (await requestFragmentRecommendation({ now: new Date().toISOString() }));
      setRecommendationState(
        result === null
          ? { status: "empty", recommendation: null }
          : {
              status: "ready",
              recommendation: createRecommendationView(result),
              actionError: null,
            },
      );
    } catch {
      setRecommendationState({
        status: "error",
        recommendation: null,
        message: RECOMMENDATION_QUERY_ERROR,
      });
    }
  }

  async function openRecommendation(): Promise<void> {
    if (recommendationState.status !== "ready" || recommendationPending !== null) {
      return;
    }

    const currentRecommendation = recommendationState.recommendation;
    setRecommendationPending("opening");
    setRecommendationState({
      status: "ready",
      recommendation: currentRecommendation,
      actionError: null,
    });
    let didCloseNpc = false;
    try {
      const result = await openFragmentRecommendation({
        recommendationId: currentRecommendation.id,
        now: new Date().toISOString(),
      });
      closeNpc();
      didCloseNpc = true;
      await waitForDialogTransition();
      const didOpen = await onOpenFragment(
        result.viewed.fragment.id,
        triggerButtonRef.current,
        true,
        true,
      );
      if (!didOpen) {
        throw new Error("fragment detail could not be opened");
      }
    } catch {
      if (didCloseNpc) {
        setRecommendationState({
          status: "error",
          recommendation: null,
          message: RECOMMENDATION_OPEN_ERROR,
        });
        onChatOpenChange(true, { preserveScreen: true });
      } else {
        setRecommendationState({
          status: "ready",
          recommendation: currentRecommendation,
          actionError: RECOMMENDATION_OPEN_ERROR,
        });
      }
    } finally {
      setRecommendationPending(null);
    }
  }

  async function dismissRecommendation(): Promise<void> {
    if (recommendationState.status !== "ready" || recommendationPending !== null) {
      return;
    }

    const currentRecommendation = recommendationState.recommendation;
    setRecommendationPending("dismissing");
    setRecommendationState({
      status: "ready",
      recommendation: currentRecommendation,
      actionError: null,
    });
    try {
      await dismissFragmentRecommendation({
        recommendationId: currentRecommendation.id,
        now: new Date().toISOString(),
      });
      setRecommendationState({ status: "dismissed", recommendation: null });
    } catch {
      setRecommendationState({
        status: "ready",
        recommendation: currentRecommendation,
        actionError: RECOMMENDATION_DISMISS_ERROR,
      });
    } finally {
      setRecommendationPending(null);
    }
  }

  async function openDormantFragment(
    fragmentId: string,
    triggerElement: HTMLButtonElement,
  ): Promise<void> {
    const isAllowed = dormantState.value.items.some((item) => item.id === fragmentId);
    if (!isAllowed) {
      setDormantOpenError("暂时没能打开这条内容。");
      return;
    }

    setDormantOpenError(null);
    closeNpc();
    try {
      await waitForDialogTransition();
      const didOpen = await onOpenFragment(
        fragmentId,
        triggerButtonRef.current ?? triggerElement,
        false,
        true,
      );
      if (didOpen) {
        return;
      }
    } catch {
      // The shared detail opener reports the user-facing failure below.
    }

    setDormantOpenError("暂时没能打开这条内容。");
    onChatOpenChange(true, { preserveScreen: true });
  }

  function requestCreateFragment(): void {
    closeNpc();
    onRequestCreateFragment();
  }

  function closeNpc(): void {
    setDormantOpenError(null);
    onChatOpenChange(false);
  }

  const initialNpcScreen: CompanionNpcScreen = preserveCompanionScreen
    ? dormantOpenError !== null
      ? "dormant_list"
      : recommendationState.status === "error"
        ? "recommendation_result"
        : "main"
    : "main";

  return (
    <>
      {settingsState.status === "error" ? (
        <aside
          className="mx-auto mt-4 flex max-w-[960px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-garden-danger/30 bg-garden-paper px-4 py-3 text-sm"
          role="alert"
        >
          <p className="font-semibold text-garden-danger">
            暂时无法读取伙伴设置。卡片模式仍可使用。
          </p>
          <button
            className="rounded-full border border-garden-line px-4 py-2 font-semibold text-garden-ink hover:bg-garden-soft"
            onClick={() => setSettingsAttempt((attempt) => attempt + 1)}
            type="button"
          >
            重新读取
          </button>
        </aside>
      ) : null}

      <CompanionOnboardingDialog
        errorMessage={onboardingError}
        isOpen={
          settingsState.status === "ready" &&
          (!settingsState.value.onboardingCompleted || settingsState.value.companionType === null)
        }
        isPending={isChoosing}
        onChoose={(nextCompanionType) => void chooseCompanion(nextCompanionType)}
      />

      {companionType !== null ? (
        <CompanionNpcDialog
          companionType={companionType}
          dormantState={{
            status: dormantState.status,
            items: dormantState.value.items,
            remainingCount: dormantState.value.remainingCount,
          }}
          dormantOpenError={dormantOpenError}
          gardenSummary={gardenSummary}
          gardenSummaryStatus={gardenSummaryStatus}
          isOpen={isChatOpen}
          initialScreen={initialNpcScreen}
          key={companionOpenGeneration}
          isPending={recommendationPending !== null || recommendationState.status === "loading"}
          onClose={closeNpc}
          onCreateFragment={requestCreateFragment}
          onDismissRecommendation={() => void dismissRecommendation()}
          onOpenDormantFragment={(fragmentId, triggerElement) =>
            void openDormantFragment(fragmentId, triggerElement)
          }
          onOpenRecommendation={() => void openRecommendation()}
          onRequestRecommendation={() => void requestRecommendation()}
          onRetryDormant={() => setDormantAttempt((attempt) => attempt + 1)}
          recommendationPending={recommendationPending}
          recommendationState={recommendationState}
        />
      ) : null}
    </>
  );
}
