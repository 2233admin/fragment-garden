"use client";

import { useEffect, useId, useRef } from "react";

import type { ExternalLinkImport, Fragment, MediaAsset, Plant } from "@/domain";
import { isSproutRecommendedActionAllowed } from "@/domain/sprout/recommended-actions";
import type { SproutAddition, SproutRecommendedAction } from "@/validation/sprout-api";

import { ModalDialog } from "../shared/ModalDialog";
import type { SproutAnalysisState } from "./sprout-analysis-state";
import { SproutDisclosureDialog } from "./SproutDisclosureDialog";
import { SproutSuggestionResult } from "./SproutSuggestionResult";
import { useSproutAnalysis } from "./useSproutAnalysis";

type SproutAnalysisDialogProps = {
  additions: readonly SproutAddition[];
  externalLinkImport: ExternalLinkImport | null;
  fragment: Fragment;
  onClose: () => void;
  onContinue: (action: SproutRecommendedAction) => void;
  plant: Plant;
  mediaAsset?: MediaAsset | null;
};

const SECONDARY_BUTTON_CLASS =
  "rounded-full border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50";
const PRIMARY_BUTTON_CLASS =
  "rounded-full bg-garden-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60";

function isSuggestionState(
  state: SproutAnalysisState,
): state is Extract<SproutAnalysisState, { status: "suggestion" | "saving" | "saved" }> {
  return state.status === "suggestion" || state.status === "saving" || state.status === "saved";
}

export function SproutAnalysisDialog({
  additions,
  externalLinkImport,
  fragment,
  onClose,
  onContinue,
  plant,
  mediaAsset = null,
}: SproutAnalysisDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const analysis = useSproutAnalysis({
    additions,
    externalLinkImport,
    fragment,
    plant,
    mediaAsset,
  });
  const { state } = analysis;
  const isSaving = state.status === "saving";
  const isDisclosureOpen =
    state.status === "awaiting_disclosure" || state.status === "saving_disclosure";

  useEffect(() => {
    if (
      state.status === "suggestion" ||
      state.status === "saved" ||
      state.status === "insufficient" ||
      state.status === "local_guidance" ||
      state.status === "failed"
    ) {
      requestAnimationFrame(() => resultHeadingRef.current?.focus());
    }
  }, [state.status]);

  function close(): void {
    if (isSaving) {
      return;
    }

    analysis.cancel();
    onClose();
  }

  function continueWith(action: SproutRecommendedAction): void {
    if (
      isSaving ||
      !isSproutRecommendedActionAllowed(action, {
        completionStatus: fragment.completionStatus,
        lifecycleStatus: fragment.lifecycleStatus,
      })
    ) {
      return;
    }

    analysis.cancel();
    onContinue(action);
  }

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[90vh] w-[min(92vw,42rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
        describedBy={descriptionId}
        isOpen
        isPending={isSaving}
        labelledBy={titleId}
        onRequestClose={close}
      >
        <header className="flex items-start justify-between gap-5 border-b border-garden-line px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-garden-accent uppercase">
              花园伙伴
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
              思维发芽
            </h2>
            <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
              让伙伴帮这个想法找到一个更具体的方向。
            </p>
          </div>
          <button
            aria-label="关闭思维发芽"
            className={SECONDARY_BUTTON_CLASS}
            disabled={isSaving}
            onClick={close}
            type="button"
          >
            关闭
          </button>
        </header>

        <div className="px-6 py-6 sm:px-8">
          {state.status === "checking" || state.status === "analyzing" ? (
            <section aria-live="polite" aria-busy="true" className="py-10 text-center">
              <p className="font-display text-xl font-semibold text-garden-ink">
                {state.status === "checking" ? "伙伴正在过来看看……" : "伙伴正在看看这个想法……"}
              </p>
              <p className="mt-3 text-sm leading-6 text-garden-muted">
                这里只分析当前选中的碎片，不会改变原文或植物阶段。
              </p>
            </section>
          ) : null}

          {isDisclosureOpen ? (
            <section aria-live="polite" className="py-10 text-center">
              <p className="font-display text-xl font-semibold text-garden-ink">
                需要先确认数据说明
              </p>
              <p className="mt-3 text-sm leading-6 text-garden-muted">
                你的选择保存后，伙伴才会继续查看当前碎片。
              </p>
            </section>
          ) : null}

          {state.status === "insufficient" ? (
            <section>
              <h3
                className="font-display text-xl font-semibold text-garden-ink outline-none"
                ref={resultHeadingRef}
                tabIndex={-1}
              >
                暂时还不能找到具体方向
              </h3>
              <p className="mt-4 border-l-4 border-garden-accent pl-4 text-sm leading-7 text-garden-ink">
                暂时没有检测到足够的“思维养分”。再补充一点背景、问题或你在意的原因后，可以重新让伙伴看看。
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button className={SECONDARY_BUTTON_CLASS} onClick={close} type="button">
                  返回
                </button>
                <button
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => continueWith("add_content")}
                  type="button"
                >
                  补充内容
                </button>
              </div>
            </section>
          ) : null}

          {state.status === "local_guidance" ? (
            <section>
              <h3
                className="font-display text-xl font-semibold text-garden-ink outline-none"
                ref={resultHeadingRef}
                tabIndex={-1}
              >
                伙伴的基础观察
              </h3>
              <p className="mt-4 border-l-4 border-garden-accent pl-4 text-sm leading-7 text-garden-ink">
                伙伴暂时只做了基础观察。你可以先补充这个想法的背景、你在意的问题，或者下一步想尝试的事情。
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button className={SECONDARY_BUTTON_CLASS} onClick={close} type="button">
                  返回
                </button>
                <button
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => continueWith("add_content")}
                  type="button"
                >
                  补充内容
                </button>
              </div>
            </section>
          ) : null}

          {state.status === "failed" ? (
            <section>
              <h3
                className="font-display text-xl font-semibold text-garden-ink outline-none"
                ref={resultHeadingRef}
                tabIndex={-1}
              >
                伙伴暂时没能找到方向
              </h3>
              <p
                aria-live="assertive"
                className="mt-4 rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
                role="alert"
              >
                {state.message}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button className={SECONDARY_BUTTON_CLASS} onClick={close} type="button">
                  返回
                </button>
                <button
                  className={SECONDARY_BUTTON_CLASS}
                  onClick={() => continueWith("add_content")}
                  type="button"
                >
                  补充内容
                </button>
                <button className={PRIMARY_BUTTON_CLASS} onClick={analysis.retry} type="button">
                  重试
                </button>
              </div>
            </section>
          ) : null}

          {isSuggestionState(state) ? (
            <SproutSuggestionResult
              headingRef={resultHeadingRef}
              onClose={close}
              onContinue={continueWith}
              onRequestAnother={analysis.requestAnotherDirection}
              onSave={() => void analysis.saveSuggestion()}
              state={state}
            />
          ) : null}
        </div>
      </ModalDialog>

      <SproutDisclosureDialog
        errorMessage={analysis.disclosureError}
        isOpen={isDisclosureOpen}
        isPending={analysis.isDisclosurePending}
        onAccept={() => void analysis.acceptDisclosure()}
        onCancel={close}
        onUseLocal={analysis.useLocalGuidance}
      />
    </>
  );
}
