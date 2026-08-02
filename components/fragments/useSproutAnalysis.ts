"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { queryLocalSettings } from "@/data/queries/companion-query";
import { SPROUT_PREPARATION_DELAY_MS, SPROUT_PROMPT_VERSION } from "@/domain/sprout/constants";
import { isSproutRecommendedActionAllowed } from "@/domain/sprout/recommended-actions";
import { acceptSproutDisclosure } from "@/services/accept-sprout-disclosure";
import { savePartnerSuggestion } from "@/services/save-partner-suggestion";
import {
  SproutApiClient,
  SproutApiClientError,
  sproutErrorMessage,
} from "@/services/sprout-api-client";
import {
  createSproutAnalysisRequest,
  createSproutSession,
  isSproutSessionReady,
  type SproutAnalysisState,
  type SproutSessionInput,
} from "./sprout-analysis-state";

const apiClient = new SproutApiClient();

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

export function useSproutAnalysis(input: SproutSessionInput) {
  const [session] = useState(() => createSproutSession(input));
  const [state, setState] = useState<SproutAnalysisState>({ status: "checking" });
  const [disclosureError, setDisclosureError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const avoidDirectionsRef = useRef<string[]>([]);
  const disclosureLockRef = useRef(false);
  const generationRef = useRef(0);
  const isMountedRef = useRef(false);
  const requestLockRef = useRef(false);
  const saveLockRef = useRef(false);

  const cancel = useCallback((): void => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestLockRef.current = false;
  }, []);

  const runAnalysis = useCallback(
    async (avoidDirections: readonly string[]): Promise<void> => {
      if (requestLockRef.current || session.fragment.lifecycleStatus === "deleted") {
        return;
      }

      requestLockRef.current = true;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setState({ status: "analyzing" });

      try {
        const result = await apiClient.analyze(
          createSproutAnalysisRequest(session, avoidDirections),
          abortController.signal,
        );

        if (!isMountedRef.current || generationRef.current !== generation) {
          return;
        }

        if (result.type === "insufficient_content") {
          setState({ status: "insufficient" });
          return;
        }

        if (
          !isSproutRecommendedActionAllowed(result.recommendedAction, {
            completionStatus: session.fragment.completionStatus,
            lifecycleStatus: session.fragment.lifecycleStatus,
          })
        ) {
          setState({
            status: "failed",
            message: sproutErrorMessage("invalid_model_response"),
            retryKind: "analyze",
          });
          return;
        }

        setState({
          status: "suggestion",
          suggestion: result,
          suggestionId: globalThis.crypto.randomUUID(),
          saveError: null,
        });
      } catch (error) {
        if (
          abortController.signal.aborted ||
          !isMountedRef.current ||
          generationRef.current !== generation
        ) {
          return;
        }

        setState({
          status: "failed",
          message:
            error instanceof SproutApiClientError
              ? sproutErrorMessage(error.code)
              : sproutErrorMessage("provider_error"),
          retryKind: "analyze",
        });
      } finally {
        if (generationRef.current === generation) {
          requestLockRef.current = false;
          abortControllerRef.current = null;
        }
      }
    },
    [session],
  );

  const runPreparation = useCallback(async (): Promise<void> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setState({ status: "checking" });
    await delay(SPROUT_PREPARATION_DELAY_MS);

    if (!isMountedRef.current || generationRef.current !== generation) {
      return;
    }

    if (!isSproutSessionReady(session)) {
      setState({ status: "insufficient" });
      return;
    }

    try {
      const settings = await queryLocalSettings();
      if (!isMountedRef.current || generationRef.current !== generation) {
        return;
      }

      if (settings.sproutAiDisclosureAcceptedAt == null) {
        setState({ status: "awaiting_disclosure" });
        return;
      }

      await runAnalysis(avoidDirectionsRef.current);
    } catch {
      if (isMountedRef.current && generationRef.current === generation) {
        setState({
          status: "failed",
          message: "伙伴暂时没能读取发芽设置。你可以补充一点内容，或者稍后再试。",
          retryKind: "prepare",
        });
      }
    }
  }, [runAnalysis, session]);

  useEffect(() => {
    isMountedRef.current = true;
    const preparationTimer = window.setTimeout(() => void runPreparation(), 0);
    return () => {
      window.clearTimeout(preparationTimer);
      isMountedRef.current = false;
      cancel();
    };
  }, [cancel, runPreparation]);

  async function acceptDisclosure(): Promise<void> {
    if (state.status !== "awaiting_disclosure" || disclosureLockRef.current) {
      return;
    }

    const disclosureGeneration = generationRef.current;
    disclosureLockRef.current = true;
    setDisclosureError(null);
    setState({ status: "saving_disclosure" });
    try {
      await acceptSproutDisclosure({ now: new Date().toISOString() });
      if (!isMountedRef.current || generationRef.current !== disclosureGeneration) {
        return;
      }
      await runAnalysis(avoidDirectionsRef.current);
    } catch {
      if (isMountedRef.current && generationRef.current === disclosureGeneration) {
        setState({ status: "awaiting_disclosure" });
        setDisclosureError("这次没有保存你的选择，也没有发送碎片内容。请重试。");
      }
    } finally {
      disclosureLockRef.current = false;
    }
  }

  function useLocalGuidance(): void {
    if (state.status !== "awaiting_disclosure" || disclosureLockRef.current) {
      return;
    }

    setDisclosureError(null);
    setState({ status: "local_guidance" });
  }

  function retry(): void {
    if (state.status === "failed") {
      if (state.retryKind === "prepare") {
        void runPreparation();
      } else {
        void runAnalysis(avoidDirectionsRef.current);
      }
    }
  }

  function requestAnotherDirection(): void {
    if (
      (state.status !== "suggestion" && state.status !== "saved") ||
      requestLockRef.current ||
      saveLockRef.current
    ) {
      return;
    }

    avoidDirectionsRef.current = [...avoidDirectionsRef.current, state.suggestion.direction].slice(
      -3,
    );
    void runAnalysis(avoidDirectionsRef.current);
  }

  async function saveSuggestion(): Promise<void> {
    if (state.status !== "suggestion" || saveLockRef.current) {
      return;
    }

    const current = state;
    saveLockRef.current = true;
    setState({
      status: "saving",
      suggestion: current.suggestion,
      suggestionId: current.suggestionId,
    });

    try {
      await savePartnerSuggestion({
        fragmentId: session.fragment.id,
        suggestionId: current.suggestionId,
        direction: current.suggestion.direction,
        guidingQuestion: current.suggestion.guidingQuestion,
        recommendedAction: current.suggestion.recommendedAction,
        promptVersion: SPROUT_PROMPT_VERSION,
        now: new Date().toISOString(),
      });
      if (isMountedRef.current) {
        setState({
          status: "saved",
          suggestion: current.suggestion,
          suggestionId: current.suggestionId,
        });
      }
    } catch {
      if (isMountedRef.current) {
        setState({
          status: "suggestion",
          suggestion: current.suggestion,
          suggestionId: current.suggestionId,
          saveError: "这条建议暂时没有保存，也没有产生部分更新。你可以重试。",
        });
      }
    } finally {
      saveLockRef.current = false;
    }
  }

  return {
    acceptDisclosure,
    cancel,
    disclosureError,
    isDisclosurePending: state.status === "saving_disclosure",
    requestAnotherDirection,
    retry,
    saveSuggestion,
    state,
    useLocalGuidance,
  };
}
