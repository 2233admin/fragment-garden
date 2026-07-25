"use client";

import { useEffect, useState } from "react";

import type { Fragment, MediaAsset } from "@/domain";
import { queryLocalSettings } from "@/data/queries/companion-query";
import { acceptVoiceDisclosure } from "@/services/accept-voice-disclosure";
import {
  processAudioTranscription,
  setAudioLocalOnly,
  updateAudioTranscript,
} from "@/services/audio-media-processing";

import { AsyncButton } from "../shared/AsyncButton";
import { VoiceDisclosureDialog, VoiceReplaceTranscriptDialog } from "./VoiceDisclosureDialog";

type VoiceMediaPanelProps = Readonly<{
  fragment: Fragment;
  mediaAsset: MediaAsset;
}>;

const STATUS_LABELS = {
  local_only: "仅保存在本地",
  pending: "等待处理",
  processing: "正在转写",
  completed: "转写完成",
  failed: "转写失败",
} as const;

function useBlobUrl(blob: Blob | null): string | null {
  const [resource, setResource] = useState<{ blob: Blob | null; url: string | null }>({
    blob: null,
    url: null,
  });

  useEffect(() => {
    let nextUrl: string | null = null;
    if (blob !== null && typeof URL.createObjectURL === "function") {
      try {
        nextUrl = URL.createObjectURL(blob);
      } catch {
        nextUrl = null;
      }
    }

    let isActive = true;
    Promise.resolve().then(() => {
      if (isActive) {
        setResource({ blob, url: nextUrl });
      }
    });

    return () => {
      isActive = false;
      if (nextUrl !== null) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [blob]);

  return resource.blob === blob ? resource.url : null;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "时长未知";
  }
  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_024 * 1_024) return `${Math.ceil(sizeBytes / 1_024)} KB`;
  return `${(sizeBytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function VoiceMediaPanel({ fragment, mediaAsset }: VoiceMediaPanelProps) {
  const audioUrl = useBlobUrl(mediaAsset.blob);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedAudioUrl, setFailedAudioUrl] = useState<string | null>(null);
  const [draftTranscriptOverride, setDraftTranscriptOverride] = useState<string | null>(null);
  const [isTranscriptDirty, setIsTranscriptDirty] = useState(false);
  const [dirtyAssetId, setDirtyAssetId] = useState<string | null>(null);
  const [replaceEditedTranscript, setReplaceEditedTranscript] = useState(false);

  const isDeleted = fragment.lifecycleStatus === "deleted";
  const isProcessing = mediaAsset.processingStatus === "processing";
  const isAudioLoadFailed = audioUrl !== null && failedAudioUrl === audioUrl;

  function handleAudioLoadError(): void {
    setFailedAudioUrl(audioUrl);
  }

  const draftTranscript =
    isTranscriptDirty && dirtyAssetId === mediaAsset.id
      ? (draftTranscriptOverride ?? "")
      : (mediaAsset.transcript ?? "");

  async function runTranscription(
    shouldReplaceEditedTranscript: boolean,
    skipBusyCheck = false,
  ): Promise<void> {
    if ((!skipBusyCheck && isPending) || isDeleted || isProcessing) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      const result = await processAudioTranscription(mediaAsset.id, {
        replaceEditedTranscript: shouldReplaceEditedTranscript,
      });
      if (result === null) {
        setErrorMessage("这次转写结果已经过期，录音仍保存在本地。请重新发起转写。");
        return;
      }
      setDraftTranscriptOverride(null);
      setIsTranscriptDirty(false);
      setDirtyAssetId(null);
    } catch {
      setErrorMessage("录音仍保存在本地，但转写暂时失败，可以稍后重试。");
    } finally {
      setIsPending(false);
      setIsReplaceConfirmOpen(false);
      setReplaceEditedTranscript(false);
    }
  }

  async function startTranscriptionFlow(shouldReplaceEditedTranscript: boolean): Promise<void> {
    if (isPending || isDeleted || isProcessing) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      const settings = await queryLocalSettings();
      if (settings.voiceAiDisclosureAcceptedAt === null) {
        setReplaceEditedTranscript(shouldReplaceEditedTranscript);
        setIsDisclosureOpen(true);
        setIsPending(false);
        return;
      }
      setIsPending(false);
      await runTranscription(shouldReplaceEditedTranscript);
    } catch {
      setIsPending(false);
      setErrorMessage("暂时无法读取语音转写设置。录音仍保存在本地，请稍后重试。");
    }
  }

  async function requestTranscription(): Promise<void> {
    if (isPending || isDeleted || isProcessing) return;
    if (isTranscriptDirty || mediaAsset.transcriptEditedAt !== null) {
      setReplaceEditedTranscript(true);
      setIsReplaceConfirmOpen(true);
      return;
    }
    await startTranscriptionFlow(false);
  }

  async function acceptDisclosureAndTranscribe(): Promise<void> {
    if (isPending || isDeleted) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      await acceptVoiceDisclosure({ now: new Date().toISOString() });
      setIsDisclosureOpen(false);
      setIsPending(false);
      await runTranscription(replaceEditedTranscript, true);
    } catch {
      setErrorMessage("这次选择没有保存，录音仍只保存在本地。请重试。");
      setIsPending(false);
    }
  }

  async function chooseLocalOnly(): Promise<void> {
    if (isPending || isDeleted) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      await setAudioLocalOnly(mediaAsset.id);
      setIsDisclosureOpen(false);
    } catch {
      setErrorMessage("暂时无法更新处理状态，录音仍然保存在本地。");
    } finally {
      setIsPending(false);
      setReplaceEditedTranscript(false);
    }
  }

  async function saveTranscript(): Promise<void> {
    if (isPending || isDeleted || !isTranscriptDirty) return;
    setIsPending(true);
    setErrorMessage(null);
    try {
      const updated = await updateAudioTranscript({
        assetId: mediaAsset.id,
        transcript: draftTranscript,
      });
      if (updated === null) {
        setErrorMessage("这段录音已经无法修改，当前内容仍保留在本地。");
        return;
      }
      setDraftTranscriptOverride(null);
      setIsTranscriptDirty(false);
      setDirtyAssetId(null);
    } catch {
      setErrorMessage("转写修改没有保存。请保留当前文字并重试。");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-garden-line bg-garden-canvas/35 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-xl font-semibold text-garden-ink">语音</h3>
          <span className="text-xs font-semibold text-garden-muted">
            {STATUS_LABELS[mediaAsset.processingStatus]}
          </span>
        </div>
        {mediaAsset.errorCode === "request_interrupted" ? (
          <p aria-live="polite" className="mt-2 text-sm text-garden-muted" role="status">
            上次处理未完成，可以重试。
          </p>
        ) : null}

        {audioUrl !== null ? (
          <audio
            aria-label={`用户上传的语音：${fragment.title}`}
            className="mt-4 w-full"
            controls
            onError={handleAudioLoadError}
            preload="metadata"
            src={audioUrl}
          >
            当前浏览器无法播放这段录音。
          </audio>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-garden-line px-4 py-6 text-sm text-garden-muted">
            录音暂时无法播放，但原始记录仍保存在本地。
          </p>
        )}
        {isAudioLoadFailed ? (
          <p aria-live="polite" className="mt-2 text-sm leading-6 text-garden-muted" role="status">
            录音暂时无法播放，但原始记录仍保存在本地。
          </p>
        ) : null}

        <dl className="mt-4 grid gap-2 text-sm text-garden-muted sm:grid-cols-3">
          <div>
            <dt className="font-semibold">文件类型</dt>
            <dd>{mediaAsset.mimeType}</dd>
          </div>
          <div>
            <dt className="font-semibold">文件大小</dt>
            <dd>{formatFileSize(mediaAsset.sizeBytes)}</dd>
          </div>
          <div>
            <dt className="font-semibold">录音时长</dt>
            <dd>{formatDuration(mediaAsset.durationMs)}</dd>
          </div>
        </dl>

        <section className="mt-5" aria-labelledby={`transcript-heading-${mediaAsset.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h4
              className="text-sm font-semibold text-garden-ink"
              id={`transcript-heading-${mediaAsset.id}`}
            >
              转写文字
            </h4>
            <span className="text-xs text-garden-muted">转写内容可以修改</span>
          </div>
          {mediaAsset.transcript !== null || isTranscriptDirty ? (
            <textarea
              aria-label="编辑转写文字"
              className="mt-2 min-h-32 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink disabled:opacity-60"
              disabled={isPending || isDeleted}
              onChange={(event) => {
                setDraftTranscriptOverride(event.target.value);
                setIsTranscriptDirty(true);
                setDirtyAssetId(mediaAsset.id);
              }}
              value={draftTranscript}
            />
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-garden-line px-4 py-4 text-sm leading-6 text-garden-muted">
              还没有转写文字。你可以稍后同意发送当前录音进行转写，也可以只保存在本地。
            </p>
          )}

          {mediaAsset.originalTranscript !== null && mediaAsset.transcriptEditedAt !== null ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-garden-muted">
                查看原始转写
              </summary>
              <p className="mt-2 whitespace-pre-wrap rounded-xl border border-garden-line bg-white p-4 leading-6 text-garden-muted">
                {mediaAsset.originalTranscript}
              </p>
            </details>
          ) : null}

          {isTranscriptDirty ? (
            <AsyncButton
              className="mt-3 rounded-full bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
              disabled={isDeleted}
              isPending={isPending}
              onClick={() => void saveTranscript()}
              pendingLabel="正在保存…"
              type="button"
            >
              保存转写修改
            </AsyncButton>
          ) : null}
        </section>

        {errorMessage !== null ? (
          <p aria-live="polite" className="mt-4 text-sm leading-6 text-garden-danger" role="status">
            {errorMessage}
          </p>
        ) : null}

        {!isDeleted && !isProcessing ? (
          <AsyncButton
            className="mt-5 rounded-full border border-garden-accent px-4 py-2.5 text-sm font-semibold text-garden-accent hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            isPending={isPending}
            onClick={() => void requestTranscription()}
            pendingLabel="正在准备…"
            type="button"
          >
            {mediaAsset.processingStatus === "completed" ? "重新转写" : "转写录音"}
          </AsyncButton>
        ) : null}
      </section>

      <VoiceDisclosureDialog
        errorMessage={errorMessage}
        isOpen={isDisclosureOpen}
        isPending={isPending}
        onAccept={() => void acceptDisclosureAndTranscribe()}
        onCancel={() => {
          if (!isPending) {
            setIsDisclosureOpen(false);
            setReplaceEditedTranscript(false);
          }
        }}
        onLocalOnly={() => void chooseLocalOnly()}
      />

      <VoiceReplaceTranscriptDialog
        isOpen={isReplaceConfirmOpen}
        isPending={isPending}
        onCancel={() => {
          if (!isPending) {
            setIsReplaceConfirmOpen(false);
            setReplaceEditedTranscript(false);
          }
        }}
        onConfirm={() => {
          setIsReplaceConfirmOpen(false);
          void startTranscriptionFlow(true);
        }}
      />
    </>
  );
}
