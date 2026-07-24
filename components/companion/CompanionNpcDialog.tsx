"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";

import type { CompanionType } from "@/domain";
import {
  getCasualLine,
  getCompanionNpcMainOptions,
  getCompanionNpcMoreOptions,
  getGardenSummaryLines,
  getGrowthRuleLines,
  getLifecycleRuleLines,
  transitionCompanionNpcScreen,
  type CompanionNpcAction,
  type CompanionNpcGardenSummary,
  type CompanionNpcOption,
  type CompanionNpcScreen,
} from "@/domain/companion/npc";
import type { DormantFragmentView } from "@/data/queries/companion-npc-query";

import { ModalDialog } from "../shared/ModalDialog";
import { CompanionMark } from "./CompanionMark";
import {
  FragmentRecommendationCard,
  type FragmentRecommendationView,
  type RecommendationPendingAction,
} from "./FragmentRecommendationCard";

export type CompanionNpcRecommendationState =
  | { status: "idle"; recommendation: null }
  | { status: "loading"; recommendation: null }
  | {
      status: "ready";
      recommendation: FragmentRecommendationView;
      actionError: string | null;
    }
  | { status: "empty"; recommendation: null }
  | { status: "dismissed"; recommendation: null }
  | { status: "error"; recommendation: null; message: string };

export type CompanionNpcDormantState =
  | { status: "loading"; items: readonly DormantFragmentView[]; remainingCount: number }
  | { status: "ready"; items: readonly DormantFragmentView[]; remainingCount: number }
  | { status: "error"; items: readonly DormantFragmentView[]; remainingCount: number };

export type CompanionNpcDialogProps = Readonly<{
  companionType: CompanionType;
  gardenSummary: CompanionNpcGardenSummary;
  gardenSummaryStatus: "loading" | "error" | "ready";
  isOpen: boolean;
  initialScreen?: CompanionNpcScreen;
  isPending?: boolean;
  recommendationState: CompanionNpcRecommendationState;
  recommendationPending: RecommendationPendingAction;
  dormantState: CompanionNpcDormantState;
  dormantOpenError?: string | null;
  onClose: () => void;
  onRequestRecommendation: () => void;
  onOpenRecommendation: () => void;
  onDismissRecommendation: () => void;
  onOpenDormantFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  onCreateFragment: () => void;
  onRetryDormant: () => void;
}>;

const SCREEN_LABELS: Readonly<Record<CompanionNpcScreen, string>> = {
  main: "伙伴主菜单",
  more: "伙伴更多选项",
  garden_summary: "花园近况",
  dormant_list: "休眠植物",
  growth_rules: "植物成长规则",
  lifecycle_rules: "生命周期规则",
  casual_line: "伙伴台词",
  recommendation_result: "回看推荐",
};

const BUTTON_CLASS =
  "w-full rounded-xl border border-garden-line bg-garden-paper px-4 py-3 text-left text-sm font-semibold text-garden-ink transition hover:border-garden-accent hover:bg-garden-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garden-accent disabled:cursor-wait disabled:opacity-55";
const SECONDARY_BUTTON_CLASS =
  "rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink transition hover:bg-garden-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-garden-accent disabled:opacity-55";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "时间未知" : DATE_FORMATTER.format(timestamp);
}

function NpcOptionButton({
  label,
  onClick,
  disabled = false,
}: Readonly<{ label: string; onClick: () => void; disabled?: boolean }>) {
  return (
    <button className={BUTTON_CLASS} disabled={disabled} onClick={onClick} type="button">
      {label}
    </button>
  );
}

export function CompanionNpcDialog({
  companionType,
  gardenSummary,
  gardenSummaryStatus,
  isOpen,
  initialScreen = "main",
  isPending = false,
  recommendationState,
  recommendationPending,
  dormantState,
  dormantOpenError = null,
  onClose,
  onRequestRecommendation,
  onOpenRecommendation,
  onDismissRecommendation,
  onOpenDormantFragment,
  onCreateFragment,
  onRetryDormant,
}: CompanionNpcDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [screen, setScreen] = useState<CompanionNpcScreen>(initialScreen);
  const screenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      screenContainerRef.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [
    dormantOpenError,
    dormantState.items.length,
    dormantState.status,
    isOpen,
    recommendationPending,
    recommendationState.status,
    screen,
  ]);

  function move(action: CompanionNpcAction): void {
    if (isPending) {
      return;
    }

    if (action.type === "leave") {
      onClose();
      return;
    }

    if (action.type === "create_fragment") {
      onCreateFragment();
      return;
    }

    if (action.type === "recommend_fragment") {
      setScreen("recommendation_result");
      onRequestRecommendation();
      return;
    }

    const nextScreen = transitionCompanionNpcScreen(screen, action);
    if (nextScreen !== null) {
      setScreen(nextScreen);
    }
  }

  function renderFooter(options: readonly CompanionNpcOption[]): ReactElement {
    return (
      <div className="mt-6 flex flex-wrap gap-2">
        {options.map((option) => {
          return (
            <button
              className={SECONDARY_BUTTON_CLASS}
              disabled={isPending}
              key={option.action.type}
              onClick={() => move(option.action)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderMain(): ReactElement {
    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        <p className="font-display text-xl leading-8 text-garden-ink">今天想先看看花园里的什么？</p>
        <div className="grid gap-3" role="list">
          {getCompanionNpcMainOptions().map((option) => (
            <NpcOptionButton
              key={option.action.type}
              label={option.label}
              onClick={() => move(option.action)}
              disabled={isPending}
            />
          ))}
        </div>
      </section>
    );
  }

  function renderMore(): ReactElement {
    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        <p className="font-display text-xl leading-8 text-garden-ink">
          还有一些关于花园的事，我也可以告诉你。
        </p>
        <div className="grid gap-3" role="list">
          {getCompanionNpcMoreOptions().map((option) => (
            <NpcOptionButton
              key={option.action.type}
              label={option.label}
              onClick={() => move(option.action)}
              disabled={isPending}
            />
          ))}
        </div>
      </section>
    );
  }

  function renderSummary(): ReactElement {
    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        {gardenSummaryStatus === "loading" ? (
          <p aria-live="polite" className="rounded-2xl bg-garden-canvas/55 p-4 text-sm">
            正在整理花园近况…
          </p>
        ) : null}
        {gardenSummaryStatus === "error" ? (
          <p
            aria-live="assertive"
            className="rounded-2xl bg-garden-danger-soft p-4 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            暂时没能整理花园近况，你仍然可以直接查看卡片。
          </p>
        ) : null}
        {gardenSummaryStatus === "ready" ? (
          <div className="space-y-2 rounded-2xl border border-garden-line bg-garden-canvas/55 p-4">
            {getGardenSummaryLines(gardenSummary).map((line) => (
              <p className="text-sm leading-6 text-garden-ink" key={line}>
                {line}
              </p>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3">
          {gardenSummaryStatus === "ready" && gardenSummary.dormantCount > 0 ? (
            <NpcOptionButton
              disabled={isPending}
              label="看看休眠植物"
              onClick={() => move({ type: "dormant_list" })}
            />
          ) : null}
          <NpcOptionButton
            disabled={isPending}
            label="帮我种下一个新想法"
            onClick={() => move({ type: "create_fragment" })}
          />
        </div>
        {renderFooter([
          { action: { type: "back" }, label: "返回" },
          { action: { type: "leave" }, label: "离开" },
        ])}
      </section>
    );
  }

  function renderDormantList(): ReactElement {
    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        {dormantOpenError !== null ? (
          <p
            aria-live="assertive"
            className="rounded-2xl bg-garden-danger-soft p-4 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            {dormantOpenError}
          </p>
        ) : null}
        {dormantState.status === "loading" ? (
          <p aria-live="polite" className="rounded-2xl bg-garden-canvas/55 p-4 text-sm">
            正在看看哪些植物在休息…
          </p>
        ) : null}
        {dormantState.status === "error" ? (
          <div className="rounded-2xl bg-garden-danger-soft p-4" role="alert">
            <p className="text-sm font-semibold text-garden-danger">
              暂时没能整理休眠植物，你仍然可以在卡片模式中查看。
            </p>
            <button
              className={`${SECONDARY_BUTTON_CLASS} mt-3 border-garden-danger text-garden-danger`}
              onClick={onRetryDormant}
              type="button"
            >
              重新读取
            </button>
          </div>
        ) : null}
        {dormantState.status === "ready" && dormantState.items.length === 0 ? (
          <p className="rounded-2xl bg-garden-canvas/55 p-4 text-sm leading-6 text-garden-ink">
            现在没有正在休眠的植物。
          </p>
        ) : null}
        {dormantState.status === "ready" && dormantState.items.length > 0 ? (
          <>
            <ul aria-label="正在休眠的植物" className="space-y-2">
              {dormantState.items.map((item) => (
                <li key={item.id}>
                  <button
                    className={BUTTON_CLASS}
                    disabled={isPending}
                    onClick={(event) => onOpenDormantFragment(item.id, event.currentTarget)}
                    type="button"
                  >
                    <span className="block truncate">打开“{item.title}”</span>
                    <span className="mt-1 block text-xs font-normal text-garden-muted">
                      最近互动：{formatDate(item.lastInteractedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {dormantState.remainingCount > 0 ? (
              <p className="text-xs leading-5 text-garden-muted">
                还有 {dormantState.remainingCount} 株可以在卡片模式中查看。
              </p>
            ) : null}
          </>
        ) : null}
        {renderFooter([
          { action: { type: "back" }, label: "返回" },
          { action: { type: "leave" }, label: "离开" },
        ])}
      </section>
    );
  }

  function renderRules(lines: readonly string[], nextAction: CompanionNpcOption): ReactElement {
    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        <div className="space-y-3 rounded-2xl border border-garden-line bg-garden-canvas/55 p-4">
          {lines.map((line) => (
            <p className="text-sm leading-6 text-garden-ink" key={line}>
              {line}
            </p>
          ))}
        </div>
        {renderFooter([
          nextAction,
          { action: { type: "back" }, label: "返回" },
          { action: { type: "leave" }, label: "离开" },
        ])}
      </section>
    );
  }

  function renderCasualLine(): ReactElement {
    const line =
      gardenSummaryStatus === "ready"
        ? getCasualLine(gardenSummary)
        : "我暂时看不清花园近况，不过我会在这里，等你想起花园的时候再来。";

    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        <p className="rounded-2xl border border-garden-line bg-garden-canvas/55 p-4 font-display text-xl leading-8 text-garden-ink">
          {line}
        </p>
        {renderFooter([
          { action: { type: "back" }, label: "返回" },
          { action: { type: "leave" }, label: "离开" },
        ])}
      </section>
    );
  }

  function renderRecommendation(): ReactElement {
    const state = recommendationState;
    return (
      <section aria-labelledby={`${titleId}-screen`} className="space-y-4" role="region">
        {state.status === "loading" ? (
          <p aria-live="polite" className="rounded-2xl bg-garden-canvas/55 p-4 text-sm">
            我去花园里看看…
          </p>
        ) : null}
        {state.status === "error" ? (
          <div
            className="rounded-2xl bg-garden-danger-soft p-4 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            <p>{state.message}</p>
            <button
              className={`${SECONDARY_BUTTON_CLASS} mt-3 border-garden-danger text-garden-danger`}
              disabled={isPending}
              onClick={onRequestRecommendation}
              type="button"
            >
              重新查找
            </button>
          </div>
        ) : null}
        {state.status === "empty" ? (
          <p className="rounded-2xl bg-garden-canvas/55 p-4 text-sm leading-6 text-garden-ink">
            现在没有特别适合回看的植物。你也可以直接去卡片模式里看看。
          </p>
        ) : null}
        {state.status === "dismissed" ? (
          <p className="rounded-2xl bg-garden-canvas/55 p-4 text-sm leading-6 text-garden-ink">
            好，先不用看它。它会继续留在花园里，想看的时候再回来就好。
          </p>
        ) : null}
        {state.status === "ready" ? (
          <>
            {state.actionError !== null ? (
              <p
                className="rounded-2xl bg-garden-danger-soft p-4 text-sm leading-6 text-garden-danger"
                role="alert"
              >
                {state.actionError}
              </p>
            ) : null}
            <p className="text-sm leading-6 text-garden-ink">
              我找到了一株以前种下的植物。现在再看它，也许会有新的想法。
            </p>
            <FragmentRecommendationCard
              onDismiss={onDismissRecommendation}
              onOpen={onOpenRecommendation}
              pendingAction={recommendationPending}
              recommendation={state.recommendation}
            />
          </>
        ) : null}
        {renderFooter([
          { action: { type: "back" }, label: "返回" },
          { action: { type: "leave" }, label: "离开" },
        ])}
      </section>
    );
  }

  function renderScreen(): ReactElement {
    switch (screen) {
      case "main":
        return renderMain();
      case "more":
        return renderMore();
      case "garden_summary":
        return renderSummary();
      case "dormant_list":
        return renderDormantList();
      case "growth_rules":
        return renderRules(getGrowthRuleLines(), {
          action: { type: "lifecycle_rules" },
          label: "再告诉我生命周期规则",
        });
      case "lifecycle_rules":
        return renderRules(getLifecycleRuleLines(), {
          action: { type: "growth_rules" },
          label: "告诉我植物为什么会成长",
        });
      case "casual_line":
        return renderCasualLine();
      case "recommendation_result":
        return renderRecommendation();
    }
  }

  return (
    <ModalDialog
      className="m-auto flex max-h-[88vh] w-[min(94vw,38rem)] flex-col overflow-hidden rounded-3xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      labelledBy={titleId}
      onRequestClose={onClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-garden-line bg-garden-paper px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <CompanionMark companionType={companionType} size="medium" />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-garden-accent uppercase">
              花园中的伙伴
            </p>
            <h2 className="font-display text-2xl font-semibold text-garden-ink" id={titleId}>
              花园伙伴
            </h2>
            <p className="sr-only" id={descriptionId}>
              通过固定选项查看花园近况、回看植物和了解花园规则。
            </p>
          </div>
        </div>
        <button
          aria-label="关闭花园伙伴"
          className={SECONDARY_BUTTON_CLASS}
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
      </header>

      <div className="min-h-0 overflow-y-auto bg-garden-canvas/30 px-5 py-5 sm:px-6">
        <h3 className="sr-only" id={`${titleId}-screen`}>
          {SCREEN_LABELS[screen]}
        </h3>
        <div aria-live="polite" ref={screenContainerRef}>
          {renderScreen()}
        </div>
      </div>
    </ModalDialog>
  );
}
