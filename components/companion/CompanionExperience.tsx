"use client";

import { useEffect, useRef, useState } from "react";

import { DuplicateLinkDialog } from "@/components/link-imports/DuplicateLinkDialog";
import { GetNoteDisclosureDialog } from "@/components/link-imports/GetNoteDisclosureDialog";
import type { CompanionType } from "@/domain";
import type { CurrentRecommendationView } from "@/data/queries/companion-query";
import { completeCompanionOnboarding } from "@/services/complete-companion-onboarding";
import { dismissFragmentRecommendation } from "@/services/dismiss-fragment-recommendation";
import { openFragmentRecommendation } from "@/services/open-fragment-recommendation";
import { requestDailyFragmentRecommendation } from "@/services/request-daily-fragment-recommendation";
import { sendCompanionMessage } from "@/services/send-companion-message";

import { CompanionChatPanel } from "./CompanionChatPanel";
import { CompanionMark } from "./CompanionMark";
import { CompanionOnboardingDialog } from "./CompanionOnboardingDialog";
import { CompanionStatusBubble } from "./CompanionStatusBubble";
import type {
  FragmentRecommendationView,
  RecommendationPendingAction,
} from "./FragmentRecommendationCard";
import { useCompanionData } from "./useCompanionData";
import { useCompanionLinkImport } from "./useCompanionLinkImport";

type CompanionExperienceProps = {
  gardenRevision: string;
  isChatOpen: boolean;
  onChatOpenChange: (isOpen: boolean) => void;
  onCompanionTypeChange: (companionType: CompanionType | null) => void;
  onOpenFragment: (
    fragmentId: string,
    triggerElement: HTMLButtonElement | null,
    viewAlreadyRecorded?: boolean,
  ) => Promise<boolean>;
  onStartLinkImport: (fragmentId: string) => void;
};

const RECOMMENDATION_QUERY_ERROR = "暂时没能找到适合回看的内容，你仍然可以在卡片模式中查找。";
const CHAT_HISTORY_QUERY_ERROR = "暂时无法读取本地对话。现有消息没有被修改，可以关闭后重试。";

function createRecommendationView(current: CurrentRecommendationView): FragmentRecommendationView {
  const source = current.fragment.rawText ?? current.fragment.summary ?? "";
  const graphemes = Array.from(source.trim());
  const excerpt = graphemes.length > 96 ? `${graphemes.slice(0, 95).join("")}…` : source.trim();

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
  isChatOpen,
  onChatOpenChange,
  onCompanionTypeChange,
  onOpenFragment,
  onStartLinkImport,
}: CompanionExperienceProps) {
  const [settingsAttempt, setSettingsAttempt] = useState(0);
  const [isChoosing, setIsChoosing] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [recommendationPending, setRecommendationPending] =
    useState<RecommendationPendingAction>(null);
  const companionButtonRef = useRef<HTMLButtonElement>(null);
  const dailyRequestLockRef = useRef(false);

  const { messagesState, recommendationState, settingsState } = useCompanionData(settingsAttempt);

  const companionType =
    settingsState.status === "ready" &&
    settingsState.value.onboardingCompleted &&
    settingsState.value.companionType !== null
      ? settingsState.value.companionType
      : null;
  const currentRecommendation =
    recommendationState.status === "ready" ? recommendationState.value : null;
  const recommendationView =
    currentRecommendation === null ? null : createRecommendationView(currentRecommendation);
  const linkImportFlow = useCompanionLinkImport({
    disclosureAcceptedAt:
      settingsState.status === "ready" ? settingsState.value.getNoteDisclosureAcceptedAt : null,
    onChatOpenChange,
    onOpenFragment,
    onStartLinkImport,
  });

  useEffect(() => {
    onCompanionTypeChange(companionType);
  }, [companionType, onCompanionTypeChange]);

  useEffect(() => {
    if (companionType === null || settingsState.status !== "ready" || dailyRequestLockRef.current) {
      return;
    }

    dailyRequestLockRef.current = true;
    setRecommendationError(null);
    void requestDailyFragmentRecommendation({ now: new Date().toISOString() })
      .catch(() => {
        setRecommendationError(RECOMMENDATION_QUERY_ERROR);
      })
      .finally(() => {
        dailyRequestLockRef.current = false;
      });
  }, [companionType, gardenRevision, settingsState]);

  useEffect(() => {
    if (!isChatOpen) {
      return;
    }

    const companionButton = companionButtonRef.current;

    return () => {
      requestAnimationFrame(() => companionButton?.focus());
    };
  }, [isChatOpen]);

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
    } catch {
      setOnboardingError("伙伴选择暂时没有保存，请重试。");
    } finally {
      setIsChoosing(false);
    }
  }

  async function sendMessage(content: string): Promise<void> {
    setRecommendationError(null);
    const result = await sendCompanionMessage({
      content,
      now: new Date().toISOString(),
    });
    await linkImportFlow.handleAction(result.response.action);
  }

  async function openRecommendation(): Promise<void> {
    if (currentRecommendation === null || recommendationPending !== null) {
      return;
    }

    setRecommendationPending("opening");
    setRecommendationError(null);

    try {
      const result = await openFragmentRecommendation({
        recommendationId: currentRecommendation.recommendation.id,
        now: new Date().toISOString(),
      });

      if (isChatOpen) {
        onChatOpenChange(false);
        await waitForDialogTransition();
      }

      const didOpen = await onOpenFragment(
        result.viewed.fragment.id,
        companionButtonRef.current,
        true,
      );

      if (!didOpen) {
        throw new Error("The shared fragment detail could not be opened");
      }
    } catch (error) {
      setRecommendationError("推荐状态没有保存，因此内容没有打开。请重试。");
      throw error;
    } finally {
      setRecommendationPending(null);
    }
  }

  async function openLinkedFragment(
    fragmentId: string,
    triggerElement: HTMLButtonElement,
  ): Promise<void> {
    onChatOpenChange(false);
    await waitForDialogTransition();
    const didOpen = await onOpenFragment(fragmentId, triggerElement);
    if (!didOpen) {
      onChatOpenChange(true);
      throw new Error("The shared fragment detail could not be opened");
    }
  }

  async function dismissRecommendation(): Promise<void> {
    if (currentRecommendation === null || recommendationPending !== null) {
      return;
    }

    setRecommendationPending("dismissing");
    setRecommendationError(null);

    try {
      await dismissFragmentRecommendation({
        recommendationId: currentRecommendation.recommendation.id,
        now: new Date().toISOString(),
      });
    } catch (error) {
      setRecommendationError("推荐状态没有保存，这条内容仍在原处。请重试。");
      throw error;
    } finally {
      setRecommendationPending(null);
    }
  }

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

      {companionType !== null ? (
        <div className="mx-auto mt-4 flex max-w-[960px] flex-wrap items-start justify-between gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-garden-line bg-garden-paper px-4 py-2 text-sm font-semibold text-garden-ink shadow-sm hover:bg-garden-soft"
            data-testid="open-companion"
            onClick={() => onChatOpenChange(true)}
            ref={companionButtonRef}
            type="button"
          >
            <CompanionMark companionType={companionType} size="small" />
            打开花园伙伴
          </button>
          {recommendationView !== null ? (
            <CompanionStatusBubble
              companionType={companionType}
              onDismiss={() => void dismissRecommendation().catch(() => undefined)}
              onOpen={() => void openRecommendation().catch(() => undefined)}
              pendingAction={recommendationPending}
            />
          ) : null}
          {recommendationError !== null ? (
            <p
              className="basis-full rounded-xl border border-garden-danger/25 bg-garden-paper px-4 py-2 text-sm font-semibold text-garden-danger"
              role="alert"
            >
              {recommendationError}
            </p>
          ) : null}
        </div>
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
        <CompanionChatPanel
          companionType={companionType}
          errorMessage={
            linkImportFlow.errorMessage ??
            (messagesState.status === "error"
              ? CHAT_HISTORY_QUERY_ERROR
              : recommendationState.status === "error"
                ? RECOMMENDATION_QUERY_ERROR
                : recommendationError)
          }
          isLoading={messagesState.status === "loading" || recommendationState.status === "loading"}
          isOpen={isChatOpen}
          isPending={recommendationPending !== null || linkImportFlow.isPending}
          messages={messagesState.status === "ready" ? messagesState.value : []}
          onClose={() => onChatOpenChange(false)}
          onDismissRecommendation={dismissRecommendation}
          onOpenLinkedFragment={openLinkedFragment}
          onOpenRecommendation={openRecommendation}
          onSend={sendMessage}
          recommendation={recommendationView}
        />
      ) : null}

      <GetNoteDisclosureDialog
        errorMessage={linkImportFlow.disclosureErrorMessage}
        isOpen={linkImportFlow.isDisclosureOpen}
        isPending={linkImportFlow.isPending}
        onAccept={() => void linkImportFlow.acceptDisclosure()}
        onCancel={linkImportFlow.cancelDisclosure}
      />

      <DuplicateLinkDialog
        errorMessage={linkImportFlow.errorMessage}
        existingTitle={linkImportFlow.duplicateLink?.existingTitle ?? "已有链接碎片"}
        isOpen={linkImportFlow.duplicateLink !== null}
        isPending={linkImportFlow.isPending}
        onCancel={linkImportFlow.cancelDuplicate}
        onCreateDuplicate={() => void linkImportFlow.createDuplicate()}
        onOpenExisting={(triggerElement) => void linkImportFlow.openExisting(triggerElement)}
      />
    </>
  );
}
