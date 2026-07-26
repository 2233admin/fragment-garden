"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { findExistingLinkContent } from "@/data/queries/content-processing-job-query";
import { queryLocalSettings } from "@/data/queries/companion-query";
import { normalizeExternalUrl, plainTextToMarkdown } from "@/domain";
import { MVP_VOICE_INPUT_ENABLED } from "@/lib/product-capabilities";
import { acceptGetNoteDisclosure } from "@/services/accept-getnote-disclosure";
import { acceptImageDisclosure } from "@/services/accept-image-disclosure";
import { createLinkProcessingJob } from "@/services/create-link-processing-job";
import { createImageProcessingJob } from "@/services/image-processing-jobs";
import { createMediaFragment } from "@/services/create-media-fragment";
import { createLocalFragment } from "@/services/create-local-fragment";
import { externalUrlSchema } from "@/validation/external-url";

import { DuplicateLinkDialog } from "../link-imports/DuplicateLinkDialog";
import { GetNoteDisclosureDialog } from "../link-imports/GetNoteDisclosureDialog";
import { ModalDialog } from "../shared/ModalDialog";
import { CreateImageFragmentForm, type ImageSelection } from "./CreateImageFragmentForm";
import { CreateLinkFragmentForm } from "./CreateLinkFragmentForm";
import { CreateTextFragmentForm } from "./CreateTextFragmentForm";
import { CreateVoiceFragmentForm } from "./CreateVoiceFragmentForm";
import { ImageDisclosureDialog } from "./ImageDisclosureDialog";
import type { VoiceRecording } from "./useVoiceRecorder";

export type CreatedFragmentNotice =
  | Readonly<{
      contentType: "text";
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

type CreateFragmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: CreatedFragmentNotice) => void;
  onOpenExistingFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
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

export function CreateFragmentDialog({
  isOpen,
  onClose,
  onCreated,
  onOpenExistingFragment,
}: CreateFragmentDialogProps) {
  const titleId = useId();
  const submissionLockRef = useRef(false);
  const [mode, setMode] = useState<CreateMode>("text");
  const [textTitle, setTextTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageTitle, setImageTitle] = useState("");
  const [imageNote, setImageNote] = useState("");
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const [disclosureError, setDisclosureError] = useState<string | null>(null);
  const [pendingLinkAllowDuplicate, setPendingLinkAllowDuplicate] = useState<boolean | null>(null);
  const [isImageDisclosureOpen, setIsImageDisclosureOpen] = useState(false);
  const [imageDisclosureError, setImageDisclosureError] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DuplicateCandidate | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const isPending = pendingAction !== null;

  function clearState(): void {
    setMode("text");
    setTextTitle("");
    setRawText("");
    setLinkTitle("");
    setSourceUrl("");
    setImageTitle("");
    setImageNote("");
    setImageSelection(null);
    setPendingAction(null);
    setFormError(null);
    setSelectionError(null);
    setIsDisclosureOpen(false);
    setDisclosureError(null);
    setPendingLinkAllowDuplicate(null);
    setIsImageDisclosureOpen(false);
    setImageDisclosureError(null);
    setDuplicateCandidate(null);
    setDuplicateError(null);
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

  async function acceptDisclosure(): Promise<void> {
    const allowDuplicate = pendingLinkAllowDuplicate;
    if (pendingAction !== null || submissionLockRef.current || allowDuplicate === null) {
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
      setPendingLinkAllowDuplicate(null);
      await createAndFinishLinkJob(allowDuplicate);
    } catch {
      if (didAcceptDisclosure) {
        setFormError("链接整理任务暂时没能创建。链接仍在表单中，可以直接重试。");
      } else {
        setDisclosureError("这次选择没有保存，因此没有发送链接，也没有创建整理任务。请重试。");
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
      setFormError("内容还没有填写，碎片尚未保存。请填写内容后重试。");
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("saving_text");
    setFormError(null);

    try {
      const result = await createLocalFragment({ rawText, title: textTitle });
      const notice: CreatedFragmentNotice = {
        contentType: "text",
        title: result.fragment.title,
      };

      clearState();
      onCreated(notice);
      onClose();
    } catch {
      setFormError("保存失败，这条碎片尚未写入本地。你的输入仍在，可以直接重试。");
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
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
    } catch {
      setFormError("语音尚未保存到本地。录音仍在这里，可以直接重试。");
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

    try {
      const settings = await queryLocalSettings();
      if (settings.imageAiDisclosureAcceptedAt === null) {
        setImageDisclosureError(null);
        setIsImageDisclosureOpen(true);
        return;
      }

      setPendingAction("saving_image");
      await createAndFinishImageJob(imageSelection);
    } catch {
      setFormError("暂时无法开始整理。图片和说明仍在这里，没有创建卡片，可以直接重试。");
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  async function createAndFinishImageJob(selection: ImageSelection): Promise<void> {
    const job = await createImageProcessingJob({
      blob: selection.file,
      fileName: selection.file.name,
      height: selection.height,
      initiator: "form",
      mimeType: selection.mimeType,
      userNoteMarkdown: plainTextToMarkdown(imageNote),
      userTitle: imageTitle,
      width: selection.width,
    });
    const notice: CreatedFragmentNotice = {
      contentType: "image",
      processingJobId: job.id,
      title: job.userTitle ?? job.sourceFileName ?? "图片内容",
    };

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
      await createAndFinishImageJob(selection);
    } catch {
      if (didAcceptDisclosure) {
        setFormError("图片整理任务暂时没能创建。图片和说明仍在表单中，可以直接重试。");
      } else {
        setImageDisclosureError("这次选择没有保存，因此没有发送图片，也没有创建整理任务。请重试。");
      }
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  function finishLinkJob(jobId: string, title: string): void {
    const notice: CreatedFragmentNotice = {
      contentType: "link",
      processingJobId: jobId,
      title,
    };

    clearState();
    onCreated(notice);
    onClose();
  }

  async function createAndFinishLinkJob(allowDuplicate: boolean): Promise<void> {
    const result = await createLinkProcessingJob({
      allowDuplicate,
      initiatedBy: "form",
      sourceUrl,
      userTitle: linkTitle,
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
        return new URL(result.job.sourceUrl ?? sourceUrl).hostname.replace(/^www\./u, "");
      } catch {
        return "链接内容";
      }
    })();
    finishLinkJob(result.job.id, result.job.userTitle ?? fallbackTitle);
  }

  async function saveLink(allowDuplicate: boolean): Promise<void> {
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
        validatedSourceUrl = externalUrlSchema.parse(sourceUrl);
      } catch {
        const message = "请确认地址使用 HTTP/HTTPS，且不是本地或内网地址。没有创建卡片或整理任务。";

        if (allowDuplicate) {
          setDuplicateError(message);
        } else {
          setFormError(message);
        }
        return;
      }

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
          );
          return;
        }
      }

      const settings = await queryLocalSettings();
      if (settings.getNoteDisclosureAcceptedAt === null) {
        setPendingLinkAllowDuplicate(allowDuplicate);
        setDisclosureError(null);
        setDuplicateCandidate(null);
        setIsDisclosureOpen(true);
        return;
      }

      await createAndFinishLinkJob(allowDuplicate);
    } catch {
      const message = "暂时无法开始整理。链接仍在表单中，没有创建卡片，可以直接重试。";
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

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[90vh] w-[min(92vw,38rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
        isOpen={isOpen}
        isPending={isPending && pendingAction !== "recording_voice"}
        labelledBy={titleId}
        onRequestClose={resetAndClose}
      >
        <header className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
            新的{modeLabel}碎片
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-garden-ink" id={titleId}>
            种下{modeLabel}碎片
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted">
            {isTextMode
              ? "先在本地保存内容。标题留空时，会从第一行自动生成。"
              : isLinkMode
                ? "链接会先进入整理任务，读取成功后才会成为正式笔记和植物。"
                : isImageMode
                  ? "图片会先进入本地整理任务，分析成功后才会成为正式笔记和植物。"
                  : "录音会先保存在当前浏览器中，不需要等待转写完成。"}
          </p>

          <div
            aria-label="碎片类型"
            className="mt-4 inline-flex rounded-full border border-garden-line bg-garden-canvas/55 p-1"
            role="group"
          >
            <button
              aria-pressed={isTextMode}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                isTextMode
                  ? "bg-garden-paper text-garden-accent shadow-sm"
                  : "text-garden-muted hover:text-garden-ink"
              }`}
              disabled={isPending}
              onClick={selectTextMode}
              type="button"
            >
              文字
            </button>
            <button
              aria-busy={pendingAction === "checking_disclosure"}
              aria-pressed={isLinkMode}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                isLinkMode
                  ? "bg-garden-paper text-garden-accent shadow-sm"
                  : "text-garden-muted hover:text-garden-ink"
              }`}
              disabled={isPending}
              onClick={selectLinkMode}
              type="button"
            >
              {pendingAction === "checking_disclosure" ? "正在准备…" : "链接"}
            </button>
            <button
              aria-busy={pendingAction === "validating_image"}
              aria-pressed={isImageMode}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                isImageMode
                  ? "bg-garden-paper text-garden-accent shadow-sm"
                  : "text-garden-muted hover:text-garden-ink"
              }`}
              disabled={isPending}
              onClick={selectImageMode}
              type="button"
            >
              图片
            </button>
            {MVP_VOICE_INPUT_ENABLED ? (
              <button
                aria-pressed={isVoiceMode}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  isVoiceMode
                    ? "bg-garden-paper text-garden-accent shadow-sm"
                    : "text-garden-muted hover:text-garden-ink"
                }`}
                disabled={isPending}
                onClick={selectVoiceMode}
                type="button"
              >
                语音
              </button>
            ) : null}
          </div>

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
            errorMessage={formError}
            isPending={isPending}
            onCancel={resetAndClose}
            onSourceUrlChange={setSourceUrl}
            onSubmit={(event) => {
              event.preventDefault();
              void saveLink(false);
            }}
            onTitleChange={setLinkTitle}
            sourceUrl={sourceUrl}
            title={linkTitle}
          />
        ) : isImageMode ? (
          <CreateImageFragmentForm
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
      </ModalDialog>

      <GetNoteDisclosureDialog
        errorMessage={disclosureError}
        isOpen={isDisclosureOpen}
        isPending={pendingAction === "accepting_disclosure"}
        onAccept={() => void acceptDisclosure()}
        onCancel={() => {
          if (pendingAction === null) {
            setDisclosureError(null);
            setIsDisclosureOpen(false);
            setPendingLinkAllowDuplicate(null);
          }
        }}
      />

      <ImageDisclosureDialog
        allowLocalOnly={false}
        errorMessage={imageDisclosureError}
        isOpen={isImageDisclosureOpen}
        isPending={pendingAction === "accepting_image_disclosure"}
        onAccept={() => void acceptImageDisclosureAndCreate()}
        onCancel={() => {
          if (pendingAction === null) {
            setImageDisclosureError(null);
            setIsImageDisclosureOpen(false);
          }
        }}
        onLocalOnly={() => undefined}
      />

      <DuplicateLinkDialog
        errorMessage={duplicateError}
        existingTitle={duplicateCandidate?.title ?? ""}
        isOpen={duplicateCandidate !== null}
        isPending={pendingAction === "saving_duplicate"}
        onCancel={() => {
          if (pendingAction === null) {
            setDuplicateCandidate(null);
            setDuplicateError(null);
          }
        }}
        onCreateDuplicate={() => void saveLink(true)}
        onOpenExisting={openExistingFragment}
      />
    </>
  );
}
