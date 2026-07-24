export type SettingsId = "local-user";
export type CompanionType = "cat" | "dog";

export type FragmentContentType = "text" | "link" | "image" | "audio";
export type FragmentLifecycleStatus = "active" | "dormant" | "archived" | "deleted";
export type FragmentCompletionStatus = "open" | "completed";
export type FragmentAnalysisStatus = "not_required" | "pending" | "completed" | "failed";

export type AttachmentKind = "image" | "audio";

export type FragmentEventType =
  | "created"
  | "viewed"
  | "dormant"
  | "reviewed"
  | "text_added"
  | "link_added"
  | "image_added"
  | "audio_added"
  | "next_step_added"
  | "progress_recorded"
  | "cluster_joined"
  | "child_fragment_created"
  | "completed"
  | "restored"
  | "archived"
  | "deleted";

export type TextAddedEventPayload = {
  text: string;
};

export type FragmentReviewDecision = "still_interested" | "not_now" | "no_longer_needed";

export type ReviewedEventPayload = {
  decision: FragmentReviewDecision;
};

export type CompletedEventPayload = {
  outcome: string | null;
};

export type ChildFragmentCreatedEventPayload = {
  childFragmentId: string;
};

export type ArchivedEventPayload = {
  previousSlotId: string | null;
};

export type FragmentRestoredReason = "viewed" | "reviewed" | "manual_restore" | "content_updated";

export type RestoredEventPayload = {
  reason: FragmentRestoredReason;
};

export type PlantSpeciesId =
  "dandelion" | "forget_me_not" | "tulip" | "sunflower" | "lavender" | "small_tree";

export type PlantStage = "seedling" | "growing" | "budding" | "blooming" | "permanent_bloom";

export type PlantVitality = "active" | "dormant";

export type FragmentRelationType = "similar" | "related" | "grows_from";
export type FragmentRelationStatus = "suggested" | "confirmed" | "ignored";

export type RecommendationReason = "dormant" | "not_reviewed" | "related_to_recent";
export type ChatMessageRole = "user" | "assistant";
export type CompanionAiMode = "local" | "openai";
export type ChatMessageSource = "local" | "openai" | "tool" | "system";
export type ChatMessageStatus = "pending" | "completed" | "failed";
export type LinkImportProvider = "getnote";
export type LinkImportStatus = "pending" | "processing" | "completed" | "failed";
export type LinkImportInitiator = "form" | "companion";
export type LinkImportTerminalNotificationStatus = "completed" | "failed";

export type Settings = {
  id: SettingsId;
  onboardingCompleted: boolean;
  companionType: CompanionType | null;
  lastOpenedAt: string | null;
  lastRecommendationDate: string | null;
  getNoteDisclosureAcceptedAt: string | null;
  /** Optional for V3 records; queryLocalSettings supplies the local default. */
  openAiDisclosureAcceptedAt?: string | null;
  /** Optional for V3 records; missing values are treated as local mode. */
  companionAiMode?: CompanionAiMode;
  schemaVersion: number;
};

export type Fragment = {
  id: string;
  contentType: FragmentContentType;

  title: string;
  rawText: string | null;
  sourceUrl: string | null;

  summary: string | null;
  keywords: string[];

  lifecycleStatus: FragmentLifecycleStatus;
  completionStatus: FragmentCompletionStatus;
  analysisStatus: FragmentAnalysisStatus;

  embedding: number[] | null;
  parentFragmentId: string | null;

  createdAt: string;
  updatedAt: string;
  lastInteractedAt: string;
  completedAt: string | null;
};

export type Attachment = {
  id: string;
  fragmentId: string;
  kind: AttachmentKind;
  blob: Blob;
  mimeType: string;
  fileName: string;
  sizeBytes: number;

  transcript: string | null;
  extractedText: string | null;
  createdAt: string;
};

export type FragmentEvent = {
  id: string;
  fragmentId: string;
  type: FragmentEventType;
  payload: Record<string, unknown> | null;
  occurredAt: string;
  ruleVersion: number;
};

export type Plant = {
  id: string;
  fragmentId: string;
  speciesId: PlantSpeciesId | null;
  stage: PlantStage;
  vitality: PlantVitality;
  growthScore: number;
  slotId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FragmentRelation = {
  id: string;
  sourceFragmentId: string;
  targetFragmentId: string;
  relationType: FragmentRelationType;
  status: FragmentRelationStatus;
  similarityScore: number | null;
  explanation: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type Cluster = {
  id: string;
  title: string;
  memberFragmentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type Recommendation = {
  id: string;
  fragmentId: string;
  reason: RecommendationReason;
  shownAt: string;
  openedAt: string | null;
  dismissedAt: string | null;
};

export type ChatMessage = {
  id: string;
  fragmentId: string | null;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  source?: ChatMessageSource;
  status?: ChatMessageStatus;
  clientRequestId?: string;
  errorCode?: string | null;
};

export type ExternalLinkImport = {
  id: string;
  fragmentId: string;
  provider: LinkImportProvider;

  sourceUrl: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  sourceContentTruncated: boolean;

  status: LinkImportStatus;
  initiatedBy: LinkImportInitiator;

  taskId: string | null;
  externalNoteId: string | null;
  providerRequestId: string | null;

  attemptCount: number;
  attemptGeneration: number;
  userProvidedTitle: boolean;
  userProvidedContent: boolean;

  errorCode: string | null;
  errorMessage: string | null;

  terminalNotificationStatus: LinkImportTerminalNotificationStatus | null;

  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  lastPolledAt: string | null;
  completedAt: string | null;
};
