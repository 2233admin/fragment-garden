import type { ExternalLinkImport, Fragment, MediaAsset, Plant } from "../../domain";
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
  mediaAsset?: MediaAsset | null;
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

function resolveSproutTitle(session: SproutSession): string {
  const mediaAsset =
    session.mediaAsset?.kind === "image" || session.mediaAsset?.kind === "audio"
      ? session.mediaAsset
      : null;
  const isTemporaryMediaTitle =
    mediaAsset?.temporaryTitle !== null &&
    mediaAsset?.temporaryTitle !== undefined &&
    mediaAsset.temporaryTitle === session.fragment.title;

  if (!isTemporaryMediaTitle) {
    return session.fragment.title;
  }

  // A late or locally resumed analysis can leave the Fragment on its temporary
  // label even though the derived title was already persisted on the asset.
  // Use that derived title for context, while readiness still ignores titles
  // for media-only fragments so a label cannot substitute for real content.
  return mediaAsset.generatedTitle?.trim() ?? "";
}

export function createSproutSession(input: SproutSessionInput): SproutSession {
  return {
    additions: input.additions.map((addition) => ({ ...addition })),
    externalLinkImport: input.externalLinkImport === null ? null : { ...input.externalLinkImport },
    fragment: { ...input.fragment },
    plant: { ...input.plant },
    mediaAsset:
      input.mediaAsset === undefined || input.mediaAsset === null ? null : { ...input.mediaAsset },
  };
}

export function createSproutAnalysisRequest(
  session: SproutSession,
  avoidDirections: readonly string[],
): SproutAnalyzeRequest {
  const content = resolveSessionContent(session);
  const imageAsset = session.mediaAsset?.kind === "image" ? session.mediaAsset : null;
  const audioAsset = session.mediaAsset?.kind === "audio" ? session.mediaAsset : null;
  return buildSproutContext({
    fragment: {
      title: resolveSproutTitle(session),
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
      mediaSummary: imageAsset?.summary ?? null,
      mediaVisibleText: imageAsset?.visibleText ?? null,
      mediaContentKind: imageAsset?.contentKind,
      mediaTranscript: audioAsset?.transcript ?? null,
    },
    avoidDirections,
  });
}

export function isSproutSessionReady(session: SproutSession): boolean {
  if (session.fragment.lifecycleStatus === "deleted") {
    return false;
  }

  const fragmentMediaKind: "image" | "audio" | undefined =
    session.fragment.contentType === "image"
      ? "image"
      : session.fragment.contentType === "audio"
        ? "audio"
        : undefined;
  if (
    fragmentMediaKind !== undefined &&
    (session.mediaAsset == null || session.mediaAsset.kind !== fragmentMediaKind)
  ) {
    return false;
  }

  const content = resolveSessionContent(session);
  const imageAsset = session.mediaAsset?.kind === "image" ? session.mediaAsset : null;
  const audioAsset = session.mediaAsset?.kind === "audio" ? session.mediaAsset : null;
  return evaluateSproutContentReadiness({
    title: resolveSproutTitle(session),
    body: content.body,
    additions: session.additions,
    linkSummary: content.linkSummary,
    linkText: content.linkText,
    sourceUrl: session.fragment.sourceUrl,
    mediaSummary: imageAsset?.summary ?? null,
    mediaVisibleText: imageAsset?.visibleText ?? null,
    mediaTranscript: audioAsset?.transcript ?? null,
    mediaKind: fragmentMediaKind
      ? fragmentMediaKind
      : imageAsset !== null
        ? "image"
        : audioAsset !== null
          ? "audio"
          : undefined,
  }).isReady;
}
