export type SettingsId = "local-user";
export type CompanionType = "cat" | "dog";

export type FragmentContentType = "text" | "link" | "image" | "audio";
export type FragmentLifecycleStatus = "active" | "dormant" | "archived" | "deleted";
export type FragmentCompletionStatus = "open" | "completed";
export type FragmentAnalysisStatus = "not_required" | "pending" | "completed" | "failed";

export type AttachmentKind = "image" | "audio";

/** Media records keep the original browser Blob separate from derived text. */
export type MediaAssetKind = "image" | "audio";
export type MediaProcessingStatus =
  "local_only" | "pending" | "processing" | "completed" | "failed";
export type ImageContentKind = "screenshot" | "document" | "photo" | "diagram" | "other";
export type FragmentNoteSource = "user";
export type ContentProcessingJobKind = "link" | "image" | "sprout";
export type ContentProcessingJobStatus =
  "pending" | "processing" | "awaiting_confirmation" | "completed" | "failed" | "cancelled";

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
  | "partner_suggestion_saved"
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

export type SproutRecommendedAction =
  "add_content" | "record_next_step" | "grow_new_idea" | "keep_for_later" | "mark_completed";

export type PartnerSuggestionSavedEventPayload = {
  direction: string;
  guidingQuestion: string;
  recommendedAction: SproutRecommendedAction;
  source: "partner";
  promptVersion: string;
  localDateKey: string;
};

export type PartnerSuggestion = {
  id: string;
  fragmentId: string;
  direction: string;
  guidingQuestion: string;
  recommendedAction: SproutRecommendedAction;
  source: "partner";
  createdAt: string;
  promptVersion: string;
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
  /** Optional for V3 records; queryLocalSettings supplies the local default. */
  sproutAiDisclosureAcceptedAt?: string | null;
  /** Optional for pre-media records; media analysis asks for its own consent. */
  imageAiDisclosureAcceptedAt?: string | null;
  /** Optional for pre-media records; transcription asks for its own consent. */
  voiceAiDisclosureAcceptedAt?: string | null;
  schemaVersion: number;
};

export type Fragment = {
  id: string;
  contentType: FragmentContentType;

  title: string;
  rawText: string | null;
  sourceUrl: string | null;
  contentMarkdown: string;

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

export type FragmentNote = {
  id: string;
  fragmentId: string;
  contentMarkdown: string;
  source: FragmentNoteSource;
  createdAt: string;
  updatedAt: string;
};

/**
 * V5 reserves the complete processing-job store up front. Stage 11 does not
 * create these records; link, image, and sprout workflows activate it later.
 */
export type ContentProcessingJob = {
  id: string;
  kind: ContentProcessingJobKind;
  status: ContentProcessingJobStatus;
  sourceUrl: string | null;
  sourceBlob: Blob | null;
  sourceMimeType: string | null;
  sourceFileName: string | null;
  sourceFragmentId: string | null;
  sourceSnapshot: string | null;
  createdFragmentId: string | null;
  providerTaskId: string | null;
  processingRequestId: string | null;
  resultTitle: string | null;
  resultMarkdown: string | null;
  errorCode: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
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

export type MediaAsset = {
  id: string;
  fragmentId: string;
  kind: MediaAssetKind;

  blob: Blob;
  mimeType: string;
  fileName: string | null;
  sizeBytes: number;

  width: number | null;
  height: number | null;
  durationMs: number | null;

  processingStatus: MediaProcessingStatus;
  processingRequestId: string | null;
  errorCode: string | null;

  temporaryTitle: string | null;
  generatedTitle: string | null;
  summary: string | null;
  visibleText: string | null;
  contentKind: ImageContentKind | null;

  transcript: string | null;
  originalTranscript: string | null;
  transcriptEditedAt: string | null;

  createdAt: string;
  updatedAt: string;
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
  /** Optional for V3 records created before link source content was retained separately. */
  sourceContent?: string | null;
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
