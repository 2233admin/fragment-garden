"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { findExistingLinkContent } from "@/data/queries/content-processing-job-query";
import { queryLocalSettings } from "@/data/queries/companion-query";
import { extractFirstExternalUrl, normalizeExternalUrl, plainTextToMarkdown } from "@/domain";
import { MVP_VOICE_INPUT_ENABLED } from "@/lib/product-capabilities";
import { acceptGetNoteDisclosure } from "@/services/accept-getnote-disclosure";
import { acceptImageDisclosure } from "@/services/accept-image-disclosure";
import { createLinkProcessingJob } from "@/services/create-link-processing-job";
import { createImageProcessingJob } from "@/services/image-processing-jobs";
import { createMediaFragment } from "@/services/create-media-fragment";
import { createLocalFragment } from "@/services/create-local-fragment";
import { localPersistenceErrorMessage } from "@/services/local-persistence-error";
import { externalUrlSchema } from "@/validation/external-url";

import { DuplicateLinkDialog } from "../link-imports/DuplicateLinkDialog";
import { GetNoteDisclosureDialog } from "../link-imports/GetNoteDisclosureDialog";
import { ModalDialog } from "../shared/ModalDialog";
import {
  StarmapProcessingSaveTransition,
  type ProcessingSaveTransitionGeometry,
  type ProcessingSaveTransitionOutcome,
} from "../content-processing/StarmapProcessingSaveTransition";
import { CreateModePillNav, type StarmapCreateMode } from "./CreateModePillNav";
import { CreateImageFragmentForm, type ImageSelection } from "./CreateImageFragmentForm";
import { CreateLinkFragmentForm } from "./CreateLinkFragmentForm";
import { CreateTextFragmentForm } from "./CreateTextFragmentForm";
import { CreateVoiceFragmentForm } from "./CreateVoiceFragmentForm";
import { ImageDisclosureDialog } from "./ImageDisclosureDialog";
import {
  StarmapTextSaveTransition,
  type TextSaveTransitionGeometry,
} from "./StarmapTextSaveTransition";
import type { VoiceRecording } from "./useVoiceRecorder";

export type CreatedFragmentNotice =
  | Readonly<{
      contentType: "text";
      fragmentId: string;
      title: string;
    }>
  | Readonly<{
      contentType: "link";
      processingJobId: string;
      title: string;
    }>
  | Readonly<{
      contentType: "image";
      processingJobId: string;
      title: string;
    }>
  | Readonly<{
      contentType: "audio";
      fragmentId: string;
      mediaAssetId: string;
      title: string;
    }>;

export type ForegroundProcessingTransitionUpdate = Readonly<{
  jobId: string;
  outcome: ProcessingSaveTransitionOutcome;
  target: Readonly<{ clientX: number; clientY: number }> | null;
}>;

type CreateFragmentDialogProps = {
  appearance?: "default" | "starmap";
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: CreatedFragmentNotice) => void;
  onOpenExistingFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  onResolveTextStarTarget?: (
    fragmentId: string,
  ) => Promise<Readonly<{ clientX: number; clientY: number }> | null>;
  onTextStarTransitionComplete?: (fragmentId: string) => void;
  foregroundProcessingUpdate?: ForegroundProcessingTransitionUpdate | null;
  onContinueProcessingInBackground?: (jobId: string) => void;
  onOpenProcessingTasks?: (jobId: string) => void;
  onProcessingStarTransitionComplete?: (jobId: string, fragmentId: string) => void;
};

type CreateMode = "text" | "link" | "image" | "voice";
type PendingAction =
  | "checking_disclosure"
  | "accepting_disclosure"
  | "checking_image_disclosure"
  | "accepting_image_disclosure"
  | "validating_image"
  | "saving_text"
  | "saving_link"
  | "saving_image"
  | "recording_voice"
  | "saving_voice"
  | "saving_duplicate"
  | null;

type DuplicateCandidate = Readonly<{
  fragmentId: string;
  title: string;
}>;

type TextSaveTransition = Readonly<{
  geometry: TextSaveTransitionGeometry;
  isReducedMotion: boolean;
  notice: Extract<CreatedFragmentNotice, Readonly<{ contentType: "text" }>>;
}>;

type CapturedSaveTransition = Readonly<{
  dialogClientLeft: number;
  dialogClientTop: number;
  geometry: TextSaveTransitionGeometry;
}>;

type ProcessingSaveTransition = Readonly<{
  captured: CapturedSaveTransition;
  isReducedMotion: boolean;
  jobId: string;
  kind: "image" | "link";
}>;

type PendingLinkSubmission = Readonly<{
  allowDuplicate: boolean;
  capturedTransition: CapturedSaveTransition | null;
  resolvedSourceUrl: string;
}>;

function captureSaveTransitionGeometry(event: FormEvent<HTMLFormElement>): CapturedSaveTransition {
  const dialog = event.currentTarget.closest("dialog");
  const dialogRect = (dialog ?? event.currentTarget).getBoundingClientRect();
  const nativeEvent = event.nativeEvent;
  const submitter =
    nativeEvent instanceof SubmitEvent && nativeEvent.submitter instanceof HTMLButtonElement
      ? nativeEvent.submitter
      : null;
  const sourceRect = submitter?.getBoundingClientRect() ?? {
    height: 42,
    left: dialogRect.right - 132,
    top: dialogRect.bottom - 62,
    width: 110,
  };

  return {
    dialogClientLeft: dialogRect.left,
    dialogClientTop: dialogRect.top,
    geometry: {
      dialogHeight: dialogRect.height,
      dialogLeft: 0,
      dialogTop: 0,
      dialogWidth: dialogRect.width,
      sourceHeight: sourceRect.height,
      sourceLeft: sourceRect.left - dialogRect.left,
      sourceTop: sourceRect.top - dialogRect.top,
      sourceWidth: sourceRect.width,
      targetClientX: sourceRect.left + sourceRect.width * 0.5,
      targetClientY: sourceRect.top + sourceRect.height * 0.5,
      targetX: sourceRect.left + sourceRect.width * 0.5 - dialogRect.left,
      targetY: sourceRect.top + sourceRect.height * 0.5 - dialogRect.top,
    },
  };
}

export function CreateFragmentDialog({
  appearance = "default",
  isOpen,
  onClose,
  onCreated,
  onOpenExistingFragment,
  onResolveTextStarTarget,
  onTextStarTransitionComplete,
  foregroundProcessingUpdate = null,
  onContinueProcessingInBackground,
  onOpenProcessingTasks,
  onProcessingStarTransitionComplete,
}: CreateFragmentDialogProps) {
  const titleId = useId();
  const submissionLockRef = useRef(false);
  const [mode, setMode] = useState<CreateMode>("text");
  const [textTitle, setTextTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageTitle, setImageTitle] = useState("");
  const [imageNote, setImageNote] = useState("");
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const [disclosureError, setDisclosureError] = useState<string | null>(null);
  const [pendingLinkSubmission, setPendingLinkSubmission] = useState<PendingLinkSubmission | null>(
    null,
  );
  const [isImageDisclosureOpen, setIsImageDisclosureOpen] = useState(false);
  const [imageDisclosureError, setImageDisclosureError] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DuplicateCandidate | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [textSaveTransition, setTextSaveTransition] = useState<TextSaveTransition | null>(null);
  const [processingSaveTransition, setProcessingSaveTransition] =
    useState<ProcessingSaveTransition | null>(null);
  const pendingImageTransitionRef = useRef<CapturedSaveTransition | null>(null);
  const isPending =
    pendingAction !== null || textSaveTransition !== null || processingSaveTransition !== null;

  function clearState(): void {
    setMode("text");
    setTextTitle("");
    setRawText("");
    setLinkTitle("");
    setLinkNote("");
    setSourceUrl("");
    setImageTitle("");
    setImageNote("");
    setImageSelection(null);
    setPendingAction(null);
    setFormError(null);
    setSelectionError(null);
    setIsDisclosureOpen(false);
    setDisclosureError(null);
    setPendingLinkSubmission(null);
    setIsImageDisclosureOpen(false);
    setImageDisclosureError(null);
    setDuplicateCandidate(null);
    setDuplicateError(null);
    setTextSaveTransition(null);
    setProcessingSaveTransition(null);
    pendingImageTransitionRef.current = null;
  }

  function resetAndClose(): void {
    const isBlockingPending = isPending && pendingAction !== "recording_voice";
    if (submissionLockRef.current || isBlockingPending) {
      return;
    }

    clearState();
    onClose();
  }

  function selectTextMode(): void {
    if (isPending) {
      return;
    }

    setMode("text");
    setImageSelection(null);
    setFormError(null);
    setSelectionError(null);
  }

  function selectImageMode(): void {
    if (isPending || mode === "image") {
      return;
    }

    setMode("image");
    setFormError(null);
    setSelectionError(null);
  }

  function selectVoiceMode(): void {
    if (!MVP_VOICE_INPUT_ENABLED || isPending || mode === "voice") {
      return;
    }

    setMode("voice");
    setImageSelection(null);
    setFormError(null);
    setSelectionError(null);
  }

  function selectLinkMode(): void {
    if (isPending || mode === "link") {
      return;
    }

    setSelectionError(null);
    setImageSelection(null);
    setMode("link");
    setFormError(null);
  }

  function selectStarmapMode(nextMode: StarmapCreateMode): void {
    if (nextMode === "text") selectTextMode();
    if (nextMode === "link") selectLinkMode();
    if (nextMode === "image") selectImageMode();
  }

  async function acceptDisclosure(): Promise<void> {
    const submission = pendingLinkSubmission;
    if (pendingAction !== null || submissionLockRef.current || submission === null) {
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("accepting_disclosure");
    setDisclosureError(null);
    let didAcceptDisclosure = false;

    try {
      await acceptGetNoteDisclosure({ now: new Date().toISOString() });
      didAcceptDisclosure = true;
      setIsDisclosureOpen(false);
      await createAndFinishLinkJob(submission);
    } catch (error) {
      if (didAcceptDisclosure) {
        setFormError(
          localPersistenceErrorMessage(
            error,
            "链接整理任务暂时没能创建。链接仍在表单中，可以直接重试。",
          ),
        );
      } else {
        setDisclosureError(
          localPersistenceErrorMessage(
            error,
            "这次选择没有保存，因此没有发送链接，也没有创建整理任务。请重试。",
          ),
        );
      }
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isPending) {
      return;
    }

    if (rawText.trim().length === 0) {
      setFormError("内容还没有填写，记录尚未保存。请填写内容后重试。");
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("saving_text");
    setFormError(null);
    const capturedTransition =
      appearance === "starmap" ? captureSaveTransitionGeometry(event) : null;
    let result: Awaited<ReturnType<typeof createLocalFragment>>;

    try {
      result = await createLocalFragment({
        rawText,
        title: appearance === "starmap" ? "" : textTitle,
      });
    } catch (error) {
      setFormError(
        localPersistenceErrorMessage(
          error,
          "保存失败，这条记录尚未写入本地。你的输入仍在，可以直接重试。",
        ),
      );
      submissionLockRef.current = false;
      setPendingAction(null);
      return;
    }

    const notice: Extract<CreatedFragmentNotice, Readonly<{ contentType: "text" }>> = {
      contentType: "text",
      fragmentId: result.fragment.id,
      title: result.fragment.title,
    };
    onCreated(notice);

    if (capturedTransition !== null && onResolveTextStarTarget !== undefined) {
      let target: Readonly<{ clientX: number; clientY: number }> | null = null;
      try {
        target = await onResolveTextStarTarget(result.fragment.id);
      } catch {
        target = null;
      }

      if (target !== null) {
        setTextSaveTransition({
          geometry: {
            ...capturedTransition.geometry,
            targetClientX: target.clientX,
            targetClientY: target.clientY,
            targetX: target.clientX - capturedTransition.dialogClientLeft,
            targetY: target.clientY - capturedTransition.dialogClientTop,
          },
          isReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          notice,
        });
        setPendingAction(null);
        return;
      }
    }

    onTextStarTransitionComplete?.(result.fragment.id);
    submissionLockRef.current = false;
    clearState();
    onClose();
  }

  function finishTextSaveTransition(): void {
    const completedTransition = textSaveTransition;
    if (completedTransition === null) return;

    onTextStarTransitionComplete?.(completedTransition.notice.fragmentId);
    submissionLockRef.current = false;
    clearState();
    onClose();
  }

  function finishProcessingSaveTransition(fragmentId: string): void {
    const transition = processingSaveTransition;
    if (transition === null) return;

    onProcessingStarTransitionComplete?.(transition.jobId, fragmentId);
    submissionLockRef.current = false;
    clearState();
    onClose();
  }

  function continueProcessingInBackground(): void {
    const transition = processingSaveTransition;
    if (transition === null) return;

    submissionLockRef.current = false;
    clearState();
    onClose();
    onContinueProcessingInBackground?.(transition.jobId);
  }

  function openProcessingTasks(): void {
    const transition = processingSaveTransition;
    if (transition === null) return;

    submissionLockRef.current = false;
    clearState();
    onClose();
    requestAnimationFrame(() => onOpenProcessingTasks?.(transition.jobId));
  }

  function handleImageValidationPending(isValidating: boolean): void {
    setPendingAction((current) => {
      if (isValidating) {
        return "validating_image";
      }

      return current === "validating_image" ? null : current;
    });
  }

  function handleVoiceBusyChange(isBusy: boolean): void {
    setPendingAction((current) => {
      if (isBusy) {
        return current === null || current === "recording_voice" ? "recording_voice" : current;
      }

      return current === "recording_voice" ? null : current;
    });
  }

  async function handleVoiceSubmit(
    recording: VoiceRecording,
    title: string,
    note: string,
  ): Promise<void> {
    if (submissionLockRef.current || (isPending && pendingAction !== "recording_voice")) {
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("saving_voice");
    setFormError(null);

    try {
      const result = await createMediaFragment({
        blob: recording.blob,
        durationMs: recording.durationMs,
        fileName: deriveVoiceFileName(recording.mimeType),
        kind: "audio",
        mimeType: recording.mimeType,
        optionalNote: note,
        optionalTitle: title,
      });
      const notice: CreatedFragmentNotice = {
        contentType: "audio",
        fragmentId: result.fragment.id,
        mediaAssetId: result.mediaAsset.id,
        title: result.fragment.title,
      };

      clearState();
      onCreated(notice);
      onClose();
    } catch (error) {
      setFormError(
        localPersistenceErrorMessage(error, "语音尚未保存到本地。录音仍在这里，可以直接重试。"),
      );
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  function deriveVoiceFileName(mimeType: string): string {
    const baseType = mimeType.toLowerCase().split(";", 1)[0] ?? "audio/webm";
    if (baseType.includes("ogg")) return "voice-recording.ogg";
    if (baseType.includes("wav")) return "voice-recording.wav";
    if (baseType.includes("mpeg") || baseType.includes("mp3")) return "voice-recording.mp3";
    if (baseType.includes("mp4") || baseType.includes("m4a")) return "voice-recording.m4a";
    return "voice-recording.webm";
  }

  async function handleImageSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isPending) {
      return;
    }

    if (imageSelection === null) {
      setFormError("请先选择一张可以读取的图片，图片尚未保存。");
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("checking_image_disclosure");
    setFormError(null);
    const capturedTransition =
      appearance === "starmap" ? captureSaveTransitionGeometry(event) : null;
    pendingImageTransitionRef.current = capturedTransition;

    try {
      const settings = await queryLocalSettings();
      if (settings.imageAiDisclosureAcceptedAt === null) {
        setImageDisclosureError(null);
        setIsImageDisclosureOpen(true);
        return;
      }

      setPendingAction("saving_image");
      await createAndFinishImageJob(imageSelection, capturedTransition);
    } catch (error) {
      setFormError(
        localPersistenceErrorMessage(
          error,
          "暂时无法开始整理。图片和说明仍在这里，没有创建卡片，可以直接重试。",
        ),
      );
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  async function createAndFinishImageJob(
    selection: ImageSelection,
    capturedTransition: CapturedSaveTransition | null,
  ): Promise<void> {
    const job = await createImageProcessingJob({
      blob: selection.file,
      fileName: selection.file.name,
      height: selection.height,
      initiator: "form",
      mimeType: selection.mimeType,
      userNoteMarkdown: plainTextToMarkdown(imageNote),
      userTitle: appearance === "starmap" ? undefined : imageTitle,
      width: selection.width,
    });
    const notice: CreatedFragmentNotice = {
      contentType: "image",
      processingJobId: job.id,
      title: job.userTitle ?? job.sourceFileName ?? "图片内容",
    };

    if (appearance === "starmap" && capturedTransition !== null) {
      setProcessingSaveTransition({
        captured: capturedTransition,
        isReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        jobId: job.id,
        kind: "image",
      });
      pendingImageTransitionRef.current = null;
      onCreated(notice);
      return;
    }

    clearState();
    onCreated(notice);
    onClose();
  }

  async function acceptImageDisclosureAndCreate(): Promise<void> {
    const selection = imageSelection;
    if (pendingAction !== null || submissionLockRef.current || selection === null) {
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("accepting_image_disclosure");
    setImageDisclosureError(null);
    let didAcceptDisclosure = false;

    try {
      await acceptImageDisclosure({ now: new Date().toISOString() });
      didAcceptDisclosure = true;
      setIsImageDisclosureOpen(false);
      setPendingAction("saving_image");
      await createAndFinishImageJob(selection, pendingImageTransitionRef.current);
    } catch (error) {
      if (didAcceptDisclosure) {
        setFormError(
          localPersistenceErrorMessage(
            error,
            "图片整理任务暂时没能创建。图片和说明仍在表单中，可以直接重试。",
          ),
        );
      } else {
        setImageDisclosureError(
          localPersistenceErrorMessage(
            error,
            "这次选择没有保存，因此没有发送图片，也没有创建整理任务。请重试。",
          ),
        );
      }
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  function finishLinkJob(
    jobId: string,
    title: string,
    capturedTransition: CapturedSaveTransition | null,
  ): void {
    const notice: CreatedFragmentNotice = {
      contentType: "link",
      processingJobId: jobId,
      title,
    };

    if (appearance === "starmap" && capturedTransition !== null) {
      setProcessingSaveTransition({
        captured: capturedTransition,
        isReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        jobId,
        kind: "link",
      });
      onCreated(notice);
      return;
    }

    clearState();
    onCreated(notice);
    onClose();
  }

  async function createAndFinishLinkJob(submission: PendingLinkSubmission): Promise<void> {
    const result = await createLinkProcessingJob({
      allowDuplicate: submission.allowDuplicate,
      initiatedBy: "form",
      sourceUrl: submission.resolvedSourceUrl,
      userNoteMarkdown: appearance === "starmap" ? plainTextToMarkdown(linkNote) : undefined,
      userTitle: appearance === "starmap" ? undefined : linkTitle,
    });

    if (result.kind === "duplicate_fragment") {
      setDuplicateCandidate({
        fragmentId: result.fragment.id,
        title: result.fragment.title,
      });
      return;
    }

    const fallbackTitle = (() => {
      try {
        return new URL(result.job.sourceUrl ?? submission.resolvedSourceUrl).hostname.replace(
          /^www\./u,
          "",
        );
      } catch {
        return "链接内容";
      }
    })();
    finishLinkJob(
      result.job.id,
      result.job.userTitle ?? fallbackTitle,
      submission.capturedTransition,
    );
  }

  async function saveLink(
    allowDuplicate: boolean,
    capturedTransition: CapturedSaveTransition | null = null,
  ): Promise<void> {
    if (submissionLockRef.current || isPending) {
      return;
    }

    submissionLockRef.current = true;
    setPendingAction(allowDuplicate ? "saving_duplicate" : "saving_link");
    setFormError(null);
    setDuplicateError(null);

    try {
      let validatedSourceUrl: string;
      try {
        const extractedSourceUrl =
          allowDuplicate && pendingLinkSubmission !== null
            ? pendingLinkSubmission.resolvedSourceUrl
            : extractFirstExternalUrl(sourceUrl);
        if (extractedSourceUrl === null) throw new Error("No safe public URL was found");
        validatedSourceUrl = externalUrlSchema.parse(extractedSourceUrl);
      } catch {
        const message =
          "没有找到可读取的公网 HTTP/HTTPS 链接。请检查分享内容后重试；没有创建卡片或整理任务。";

        if (allowDuplicate) {
          setDuplicateError(message);
        } else {
          setFormError(message);
        }
        return;
      }

      const submission: PendingLinkSubmission = {
        allowDuplicate,
        capturedTransition:
          allowDuplicate && pendingLinkSubmission !== null
            ? pendingLinkSubmission.capturedTransition
            : capturedTransition,
        resolvedSourceUrl: validatedSourceUrl,
      };
      setPendingLinkSubmission(submission);

      if (!allowDuplicate) {
        const existing = await findExistingLinkContent(normalizeExternalUrl(validatedSourceUrl));
        if (existing?.kind === "fragment") {
          setDuplicateCandidate({
            fragmentId: existing.fragment.id,
            title: existing.fragment.title,
          });
          return;
        }
        if (existing?.kind === "job") {
          finishLinkJob(
            existing.job.id,
            existing.job.userTitle ?? existing.job.resultTitle ?? "正在整理的链接",
            submission.capturedTransition,
          );
          return;
        }
      }

      const settings = await queryLocalSettings();
      if (settings.getNoteDisclosureAcceptedAt === null) {
        setDisclosureError(null);
        setDuplicateCandidate(null);
        setIsDisclosureOpen(true);
        return;
      }

      await createAndFinishLinkJob(submission);
    } catch (error) {
      const message = localPersistenceErrorMessage(
        error,
        "暂时无法开始整理。链接仍在表单中，没有创建卡片，可以直接重试。",
      );
      if (allowDuplicate) {
        setDuplicateError(message);
      } else {
        setFormError(message);
      }
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  function openExistingFragment(triggerElement: HTMLButtonElement): void {
    const existingFragmentId = duplicateCandidate?.fragmentId;

    if (existingFragmentId === undefined || isPending) {
      return;
    }

    clearState();
    onClose();
    requestAnimationFrame(() => {
      onOpenExistingFragment(existingFragmentId, triggerElement);
    });
  }

  const isTextMode = mode === "text";
  const isLinkMode = mode === "link";
  const isImageMode = mode === "image";
  const isVoiceMode = mode === "voice";
  const modeLabel = isTextMode ? "文字" : isLinkMode ? "链接" : isImageMode ? "图片" : "语音";
  const isStarmapAppearance = appearance === "starmap";
  const matchingProcessingUpdate =
    processingSaveTransition !== null &&
    foregroundProcessingUpdate?.jobId === processingSaveTransition.jobId
      ? foregroundProcessingUpdate
      : null;
  const processingOutcome = matchingProcessingUpdate?.outcome ?? { status: "pending" as const };
  const processingTarget = matchingProcessingUpdate?.target ?? null;
  const processingGeometry: ProcessingSaveTransitionGeometry | null =
    processingSaveTransition === null
      ? null
      : {
          dialogHeight: processingSaveTransition.captured.geometry.dialogHeight,
          dialogWidth: processingSaveTransition.captured.geometry.dialogWidth,
          sourceHeight: processingSaveTransition.captured.geometry.sourceHeight,
          sourceLeft: processingSaveTransition.captured.geometry.sourceLeft,
          sourceTop: processingSaveTransition.captured.geometry.sourceTop,
          sourceWidth: processingSaveTransition.captured.geometry.sourceWidth,
          targetClientX: processingTarget?.clientX ?? null,
          targetClientY: processingTarget?.clientY ?? null,
          targetX:
            processingTarget === null
              ? null
              : processingTarget.clientX - processingSaveTransition.captured.dialogClientLeft,
          targetY:
            processingTarget === null
              ? null
              : processingTarget.clientY - processingSaveTransition.captured.dialogClientTop,
        };
  const dialogClassName = isStarmapAppearance
    ? `memory-record-dialog m-auto max-h-[min(84dvh,42rem)] w-[min(90vw,31rem)] overflow-y-auto border p-0 ${
        textSaveTransition !== null
          ? "memory-record-dialog--launching"
          : processingSaveTransition !== null
            ? "memory-record-dialog--processing"
            : ""
      }`
    : "m-auto max-h-[90vh] w-[min(92vw,38rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl";

  return (
    <>
      <ModalDialog
        appearance={appearance}
        className={dialogClassName}
        isOpen={isOpen}
        isPending={isPending && pendingAction !== "recording_voice"}
        labelledBy={titleId}
        onRequestClose={resetAndClose}
      >
        <div
          aria-hidden={processingSaveTransition !== null ? true : undefined}
          className="memory-record-dialog__content-shell"
          inert={processingSaveTransition !== null}
        >
          <header className="memory-record-dialog__header border-b border-garden-line px-6 py-5 sm:px-8">
            {isStarmapAppearance ? (
              <>
                <h2 className="font-display text-2xl font-semibold text-garden-ink" id={titleId}>
                  记录此刻
                </h2>
                <CreateModePillNav
                  activeMode={mode === "voice" ? "text" : mode}
                  busyMode={
                    pendingAction === "checking_disclosure"
                      ? "link"
                      : pendingAction === "validating_image"
                        ? "image"
                        : null
                  }
                  isDisabled={isPending}
                  onChange={selectStarmapMode}
                />
              </>
            ) : (
              <>
                <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
                  新的{modeLabel}记录
                </p>
                <h2
                  className="mt-2 font-display text-3xl font-semibold text-garden-ink"
                  id={titleId}
                >
                  记录{modeLabel}内容
                </h2>
                <p className="mt-2 text-sm leading-6 text-garden-muted">
                  {isTextMode
                    ? "先在本地保存内容。标题留空时，会从第一行自动生成。"
                    : isLinkMode
                      ? "链接会先进入整理任务，读取成功后才会成为正式笔记和记忆星。"
                      : isImageMode
                        ? "图片会先进入本地整理任务，分析成功后才会成为正式笔记和记忆星。"
                        : "录音会先保存在当前浏览器中，不需要等待转写完成。"}
                </p>
                <div
                  aria-label="记录类型"
                  className="memory-record-dialog__modes mt-4 inline-flex rounded-full border border-garden-line bg-garden-canvas/55 p-1"
                  role="group"
                >
                  <button
                    aria-pressed={isTextMode}
                    className="rounded-full px-4 py-2 text-sm font-semibold"
                    disabled={isPending}
                    onClick={selectTextMode}
                    type="button"
                  >
                    文字
                  </button>
                  <button
                    aria-busy={pendingAction === "checking_disclosure"}
                    aria-pressed={isLinkMode}
                    className="rounded-full px-4 py-2 text-sm font-semibold"
                    disabled={isPending}
                    onClick={selectLinkMode}
                    type="button"
                  >
                    {pendingAction === "checking_disclosure" ? "正在准备…" : "链接"}
                  </button>
                  <button
                    aria-busy={pendingAction === "validating_image"}
                    aria-pressed={isImageMode}
                    className="rounded-full px-4 py-2 text-sm font-semibold"
                    disabled={isPending}
                    onClick={selectImageMode}
                    type="button"
                  >
                    图片
                  </button>
                  {MVP_VOICE_INPUT_ENABLED ? (
                    <button
                      aria-pressed={isVoiceMode}
                      className="rounded-full px-4 py-2 text-sm font-semibold"
                      disabled={isPending}
                      onClick={selectVoiceMode}
                      type="button"
                    >
                      语音
                    </button>
                  ) : null}
                </div>
              </>
            )}

            {selectionError !== null ? (
              <p
                aria-live="assertive"
                className="mt-3 text-sm font-semibold leading-6 text-garden-danger"
                role="alert"
              >
                {selectionError}
              </p>
            ) : null}
          </header>

          {isTextMode ? (
            <CreateTextFragmentForm
              appearance={appearance}
              errorMessage={formError}
              isPending={isPending}
              onCancel={resetAndClose}
              onRawTextChange={setRawText}
              onSubmit={(event) => void handleTextSubmit(event)}
              onTitleChange={setTextTitle}
              rawText={rawText}
              title={textTitle}
            />
          ) : isLinkMode ? (
            <CreateLinkFragmentForm
              appearance={appearance}
              errorMessage={formError}
              isPending={isPending}
              note={linkNote}
              onCancel={resetAndClose}
              onNoteChange={setLinkNote}
              onSourceUrlChange={setSourceUrl}
              onSubmit={(event) => {
                event.preventDefault();
                void saveLink(
                  false,
                  appearance === "starmap" ? captureSaveTransitionGeometry(event) : null,
                );
              }}
              onTitleChange={setLinkTitle}
              sourceUrl={sourceUrl}
              title={linkTitle}
            />
          ) : isImageMode ? (
            <CreateImageFragmentForm
              appearance={appearance}
              errorMessage={formError}
              image={imageSelection}
              isOpen={isOpen}
              isPending={isPending && pendingAction !== "validating_image"}
              note={imageNote}
              onCancel={resetAndClose}
              onImageChange={setImageSelection}
              onNoteChange={setImageNote}
              onSubmit={(event) => void handleImageSubmit(event)}
              onTitleChange={setImageTitle}
              onValidationPendingChange={handleImageValidationPending}
              title={imageTitle}
            />
          ) : (
            <CreateVoiceFragmentForm
              errorMessage={formError}
              isOpen={isOpen}
              isPending={pendingAction === "saving_voice"}
              onBusyChange={handleVoiceBusyChange}
              onCancel={resetAndClose}
              onSubmit={handleVoiceSubmit}
            />
          )}
        </div>

        {textSaveTransition !== null ? (
          <StarmapTextSaveTransition
            fragmentId={textSaveTransition.notice.fragmentId}
            geometry={textSaveTransition.geometry}
            isReducedMotion={textSaveTransition.isReducedMotion}
            onComplete={finishTextSaveTransition}
          />
        ) : null}

        {processingSaveTransition !== null && processingGeometry !== null ? (
          <StarmapProcessingSaveTransition
            geometry={processingGeometry}
            isReducedMotion={processingSaveTransition.isReducedMotion}
            jobId={processingSaveTransition.jobId}
            kind={processingSaveTransition.kind}
            onComplete={finishProcessingSaveTransition}
            onContinueInBackground={continueProcessingInBackground}
            onOpenTasks={openProcessingTasks}
            outcome={processingOutcome}
          />
        ) : null}
      </ModalDialog>

      <GetNoteDisclosureDialog
        appearance={appearance}
        errorMessage={disclosureError}
        isOpen={isDisclosureOpen}
        isPending={pendingAction === "accepting_disclosure"}
        onAccept={() => void acceptDisclosure()}
        onCancel={() => {
          if (pendingAction === null) {
            setDisclosureError(null);
            setIsDisclosureOpen(false);
            setPendingLinkSubmission(null);
          }
        }}
      />

      <ImageDisclosureDialog
        allowLocalOnly={false}
        appearance={appearance}
        errorMessage={imageDisclosureError}
        isOpen={isImageDisclosureOpen}
        isPending={pendingAction === "accepting_image_disclosure"}
        onAccept={() => void acceptImageDisclosureAndCreate()}
        onCancel={() => {
          if (pendingAction === null) {
            setImageDisclosureError(null);
            setIsImageDisclosureOpen(false);
            pendingImageTransitionRef.current = null;
          }
        }}
        onLocalOnly={() => undefined}
      />

      <DuplicateLinkDialog
        appearance={appearance}
        errorMessage={duplicateError}
        existingTitle={duplicateCandidate?.title ?? ""}
        isOpen={duplicateCandidate !== null}
        isPending={pendingAction === "saving_duplicate"}
        onCancel={() => {
          if (pendingAction === null) {
            setDuplicateCandidate(null);
            setDuplicateError(null);
            setPendingLinkSubmission(null);
          }
        }}
        onCreateDuplicate={() => void saveLink(true)}
        onOpenExisting={openExistingFragment}
      />
    </>
  );
}
