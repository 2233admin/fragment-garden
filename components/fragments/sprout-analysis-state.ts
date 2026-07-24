import type { ExternalLinkImport, Fragment, Plant } from "../../domain";
import { buildSproutContext } from "../../domain/sprout/context";
import { evaluateSproutContentReadiness } from "../../domain/sprout/readiness";
import type {
  SproutAddition,
  SproutAnalyzeRequest,
  SproutSuggestion,
} from "../../validation/sprout-api";

type SuggestionState = Readonly<{
  suggestion: SproutSuggestion;
  suggestionId: string;
}>;

export type SproutAnalysisState =
  | Readonly<{ status: "checking" }>
  | Readonly<{ status: "awaiting_disclosure" }>
  | Readonly<{ status: "saving_disclosure" }>
  | Readonly<{ status: "analyzing" }>
  | Readonly<{ status: "insufficient" }>
  | Readonly<{ status: "local_guidance" }>
  | Readonly<{ status: "failed"; message: string; retryKind: "analyze" | "prepare" }>
  | (SuggestionState & Readonly<{ status: "suggestion"; saveError: string | null }>)
  | (SuggestionState & Readonly<{ status: "saving" }>)
  | (SuggestionState & Readonly<{ status: "saved" }>);

export type SproutSessionInput = Readonly<{
  additions: readonly SproutAddition[];
  externalLinkImport: ExternalLinkImport | null;
  fragment: Fragment;
  plant: Plant;
}>;

export type SproutSession = SproutSessionInput;

function resolveSessionContent(session: SproutSession): Readonly<{
  body: string | null;
  linkSummary: string | null;
  linkText: string | null;
}> {
  if (session.fragment.contentType !== "link") {
    return { body: session.fragment.rawText, linkSummary: null, linkText: null };
  }

  const hasUserProvidedBody = session.externalLinkImport?.userProvidedContent === true;
  return {
    body: hasUserProvidedBody ? session.fragment.rawText : null,
    linkSummary: session.fragment.summary,
    linkText:
      session.externalLinkImport?.sourceContent ??
      (hasUserProvidedBody ? null : session.fragment.rawText),
  };
}

export function createSproutSession(input: SproutSessionInput): SproutSession {
  return {
    additions: input.additions.map((addition) => ({ ...addition })),
    externalLinkImport: input.externalLinkImport === null ? null : { ...input.externalLinkImport },
    fragment: { ...input.fragment },
    plant: { ...input.plant },
  };
}

export function createSproutAnalysisRequest(
  session: SproutSession,
  avoidDirections: readonly string[],
): SproutAnalyzeRequest {
  const content = resolveSessionContent(session);
  return buildSproutContext({
    fragment: {
      title: session.fragment.title,
      body: content.body,
      additions: session.additions,
      linkSummary: content.linkSummary,
      linkText: content.linkText,
      lifecycleStatus:
        session.fragment.lifecycleStatus === "deleted"
          ? "archived"
          : session.fragment.lifecycleStatus,
      isCompleted: session.fragment.completionStatus === "completed",
      isArchived: session.fragment.lifecycleStatus === "archived",
      growthStage: session.plant.stage,
    },
    avoidDirections,
  });
}

export function isSproutSessionReady(session: SproutSession): boolean {
  if (session.fragment.lifecycleStatus === "deleted") {
    return false;
  }

  const content = resolveSessionContent(session);
  return evaluateSproutContentReadiness({
    title: session.fragment.title,
    body: content.body,
    additions: session.additions,
    linkSummary: content.linkSummary,
    linkText: content.linkText,
    sourceUrl: session.fragment.sourceUrl,
  }).isReady;
}
