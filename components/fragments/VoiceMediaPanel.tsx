"use client";

import { useState } from "react";

import { useBlobObjectUrl } from "../media/useBlobObjectUrl";
import type { Fragment, MediaAsset } from "@/domain";
import { updateAudioTranscript } from "../../services/audio-media-processing";
import { localPersistenceErrorMessage } from "../../services/local-persistence-error";

import { AsyncButton } from "../shared/AsyncButton";

type VoiceMediaPanelProps = Readonly<{
  fragment: Fragment;
  mediaAsset: MediaAsset;
}>;

export function VoiceMediaPanel({ fragment, mediaAsset }: VoiceMediaPanelProps) {
  const audioUrl = useBlobObjectUrl(mediaAsset.blob);
  const [failedAudioUrl, setFailedAudioUrl] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTranscript, setDraftTranscript] = useState(mediaAsset.transcript ?? "");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDeleted = fragment.lifecycleStatus === "deleted";
  const isAudioLoadFailed = audioUrl !== null && failedAudioUrl === audioUrl;

  async function saveTranscript(): Promise<void> {
    if (isPending || isDeleted || draftTranscript.trim().length === 0) {
      if (draftTranscript.trim().length === 0) {
        setErrorMessage("转写文字不能为空，修改尚未保存。");
      }
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    try {
      const updated = await updateAudioTranscript({
        assetId: mediaAsset.id,
        transcript: draftTranscript,
      });
      if (updated === null) {
        setErrorMessage("这段录音已经无法修改，现有内容仍保存在本地。");
        return;
      }
      setDraftTranscript(updated.transcript ?? draftTranscript);
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(
        localPersistenceErrorMessage(error, "转写修改没有保存。你的输入仍在，可以重试。"),
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section aria-labelledby={`voice-title-${mediaAsset.id}`} className="space-y-6">
      <div>
        <h3
          className="mb-3 text-sm font-semibold text-garden-muted"
          id={`voice-title-${mediaAsset.id}`}
        >
          原始录音
        </h3>
        {audioUrl !== null && !isAudioLoadFailed ? (
          <audio
            aria-label={`用户录制的语音：${fragment.title}`}
            className="w-full"
            controls
            onError={() => setFailedAudioUrl(audioUrl)}
            preload="metadata"
            src={audioUrl}
          >
            当前浏览器无法播放这段录音。
          </audio>
        ) : (
          <p className="border-y border-dashed border-garden-line py-5 text-sm text-garden-muted">
            原录音暂时无法播放。已有转写和其他内容仍可使用。
          </p>
        )}
      </div>

      <div className="border-t border-garden-line pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-garden-muted">录音文字</h3>
          {!isEditing && mediaAsset.transcript !== null && !isDeleted ? (
            <button
              className="text-sm font-semibold text-garden-accent hover:text-garden-accent-strong"
              onClick={() => {
                setDraftTranscript(mediaAsset.transcript ?? "");
                setErrorMessage(null);
                setIsEditing(true);
              }}
              type="button"
            >
              编辑转写
            </button>
          ) : null}
        </div>

        {isEditing ? (
          <div className="mt-3">
            <textarea
              aria-label="编辑转写文字"
              autoFocus
              className="min-h-40 w-full resize-y rounded-lg border border-garden-line bg-white px-4 py-3 text-sm leading-7 text-garden-ink focus:border-garden-accent disabled:opacity-60"
              disabled={isPending || isDeleted}
              onChange={(event) => setDraftTranscript(event.target.value)}
              value={draftTranscript}
            />
            <div className="mt-3 flex justify-end gap-3">
              <button
                className="rounded-md border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                disabled={isPending}
                onClick={() => {
                  setDraftTranscript(mediaAsset.transcript ?? "");
                  setErrorMessage(null);
                  setIsEditing(false);
                }}
                type="button"
              >
                取消
              </button>
              <AsyncButton
                className="rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                isPending={isPending}
                onClick={() => void saveTranscript()}
                pendingLabel="正在保存…"
                type="button"
              >
                保存修改
              </AsyncButton>
            </div>
          </div>
        ) : mediaAsset.transcript !== null ? (
          <p className="mt-3 whitespace-pre-wrap text-[0.98rem] leading-8 text-garden-ink">
            {mediaAsset.transcript}
          </p>
        ) : (
          <p className="mt-3 text-sm leading-7 text-garden-muted">
            当前版本暂不提供新的语音转写。原始录音仍可继续播放。
          </p>
        )}

        {mediaAsset.originalTranscript !== null && mediaAsset.transcriptEditedAt !== null ? (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-garden-muted">
              查看最初转写
            </summary>
            <p className="mt-3 whitespace-pre-wrap border-l-2 border-garden-line pl-4 leading-7 text-garden-muted">
              {mediaAsset.originalTranscript}
            </p>
          </details>
        ) : null}

        {errorMessage !== null ? (
          <p aria-live="assertive" className="mt-3 text-sm text-garden-danger" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
