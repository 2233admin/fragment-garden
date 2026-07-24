import type { RefObject } from "react";

import { SPROUT_RECOMMENDED_ACTION_LABELS } from "@/domain/sprout/recommended-actions";
import type { SproutRecommendedAction } from "@/validation/sprout-api";

import { AsyncButton } from "../shared/AsyncButton";
import type { SproutAnalysisState } from "./sprout-analysis-state";

type SuggestionState = Extract<SproutAnalysisState, { status: "suggestion" | "saving" | "saved" }>;

type SproutSuggestionResultProps = {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onContinue: (action: SproutRecommendedAction) => void;
  onRequestAnother: () => void;
  onSave: () => void;
  state: SuggestionState;
};

const SECONDARY_BUTTON_CLASS =
  "rounded-full border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50";
const PRIMARY_BUTTON_CLASS =
  "rounded-full bg-garden-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60";

export function SproutSuggestionResult({
  headingRef,
  onClose,
  onContinue,
  onRequestAnother,
  onSave,
  state,
}: SproutSuggestionResultProps) {
  const isSaving = state.status === "saving";

  return (
    <section>
      <h3
        className="font-display text-xl font-semibold text-garden-ink outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        伙伴建议
      </h3>
      <div className="mt-4 space-y-5 border-l-4 border-garden-accent pl-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            可能的方向
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-garden-ink">
            {state.suggestion.direction}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            可以继续想想
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-garden-ink">
            {state.suggestion.guidingQuestion}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-garden-muted uppercase">
            建议下一步
          </p>
          <p className="mt-2 text-sm font-semibold text-garden-ink">
            {SPROUT_RECOMMENDED_ACTION_LABELS[state.suggestion.recommendedAction]}
          </p>
        </div>
      </div>
      <p className="mt-5 text-sm leading-6 text-garden-muted">
        这只是伙伴提供的一个方向，是否适合仍由你决定。
      </p>

      {state.status === "suggestion" && state.saveError !== null ? (
        <p
          aria-live="assertive"
          className="mt-4 rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
          role="alert"
        >
          {state.saveError}
        </p>
      ) : null}

      {state.status === "saved" ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl bg-garden-soft px-4 py-3 text-sm font-semibold text-garden-accent"
          role="status"
        >
          这条建议已经记在这株植物旁边了。
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          className={SECONDARY_BUTTON_CLASS}
          disabled={isSaving}
          onClick={onClose}
          type="button"
        >
          关闭
        </button>
        <button
          className={SECONDARY_BUTTON_CLASS}
          disabled={isSaving}
          onClick={onRequestAnother}
          type="button"
        >
          换个方向
        </button>
        <button
          className={SECONDARY_BUTTON_CLASS}
          disabled={isSaving}
          onClick={() => onContinue(state.suggestion.recommendedAction)}
          type="button"
        >
          按建议继续
        </button>
        {state.status !== "saved" ? (
          <AsyncButton
            className={PRIMARY_BUTTON_CLASS}
            isPending={isSaving}
            onClick={onSave}
            pendingLabel="正在保存…"
            type="button"
          >
            保存这条建议
          </AsyncButton>
        ) : null}
      </div>
    </section>
  );
}
