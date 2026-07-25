"use client";

import { useEffect, useState, type FormEvent } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import {
  VOICE_MAX_DURATION_MS,
  VOICE_NEAR_LIMIT_WARNING_MS,
  type VoiceRecording,
  useVoiceRecorder,
} from "./useVoiceRecorder";

type CreateVoiceFragmentFormProps = Readonly<{
  errorMessage: string | null;
  isOpen: boolean;
  isPending: boolean;
  onBusyChange?: (isBusy: boolean) => void;
  onCancel: () => void;
  onSubmit: (recording: VoiceRecording, title: string, note: string) => Promise<void>;
}>;

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes.toString() + ":" + seconds.toString().padStart(2, "0");
}

export function CreateVoiceFragmentForm({
  errorMessage,
  isOpen,
  isPending,
  onBusyChange,
  onCancel,
  onSubmit,
}: CreateVoiceFragmentFormProps) {
  const recorder = useVoiceRecorder();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const isBusy = recorder.isBusy || isSaving || isPending;
  const displayError = recorder.error?.message ?? errorMessage;
  const isNearDurationLimit =
    recorder.status === "recording" &&
    recorder.elapsedMs >= VOICE_MAX_DURATION_MS - VOICE_NEAR_LIMIT_WARNING_MS;
  const previewPlaybackFailed =
    recorder.recording !== null && failedPreviewUrl === recorder.recording.previewUrl;

  useEffect(() => {
    onBusyChange?.(recorder.isBusy || isSaving);
    return () => onBusyChange?.(false);
  }, [isSaving, onBusyChange, recorder.isBusy]);

  useEffect(() => {
    if (!isOpen && recorder.status !== "idle") {
      recorder.cancel();
    }
  }, [isOpen, recorder]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (recorder.recording === null || recorder.status !== "preview" || isBusy) return;
    setIsSaving(true);
    try {
      await onSubmit(recorder.recording, title, note);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        <section className="rounded-2xl border border-dashed border-garden-accent/45 bg-garden-canvas/45 p-5">
          {recorder.status === "idle" ? (
            <>
              <p className="text-sm leading-6 text-garden-muted">
                点击开始后才会申请麦克风权限。录音最长 3 分钟，原始录音会先保存在当前浏览器中。
              </p>
              <button
                className="mt-5 rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                disabled={isBusy}
                onClick={() => void recorder.start()}
                type="button"
              >
                开始录音
              </button>
            </>
          ) : null}

          {recorder.status === "requesting_permission" ? (
            <div aria-live="polite" className="space-y-3">
              <p className="font-semibold text-garden-ink">正在申请麦克风权限…</p>
              <p className="text-sm text-garden-muted">请在浏览器提示中允许本次录音。</p>
            </div>
          ) : null}

          {recorder.status === "error" ? (
            <div aria-live="polite" className="space-y-3">
              <p className="font-semibold text-garden-ink">录音没有开始。</p>
              <p className="text-sm text-garden-muted">
                你可以再次申请麦克风权限，或先关闭这个窗口。
              </p>
              <button
                className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                disabled={isBusy}
                onClick={() => void recorder.start()}
                type="button"
              >
                再次尝试
              </button>
            </div>
          ) : null}

          {recorder.status === "recording" || recorder.status === "stopping" ? (
            <div aria-live="polite" aria-busy={recorder.status === "stopping"}>
              <p className="font-display text-3xl font-semibold text-garden-ink">
                {formatDuration(recorder.elapsedMs)}
              </p>
              <p className="mt-2 text-sm text-garden-muted">
                {recorder.status === "stopping" ? "正在整理录音…" : "正在录音，最长 3 分钟。"}
              </p>
              {isNearDurationLimit ? (
                <p aria-live="polite" className="mt-2 text-sm font-semibold text-garden-accent">
                  录音即将达到 3 分钟上限，届时会自动停止。
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                {recorder.status === "recording" ? (
                  <button
                    className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong"
                    onClick={recorder.stop}
                    type="button"
                  >
                    停止录音
                  </button>
                ) : null}
                <button
                  className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
                  disabled={recorder.status === "stopping"}
                  onClick={recorder.cancel}
                  type="button"
                >
                  取消录音
                </button>
              </div>
            </div>
          ) : null}

          {recorder.status === "preview" && recorder.recording !== null ? (
            <div>
              <p className="font-semibold text-garden-ink">录音已经准备好</p>
              {previewPlaybackFailed ? (
                <p
                  aria-live="polite"
                  className="mt-4 rounded-xl border border-dashed border-garden-line px-4 py-4 text-sm text-garden-muted"
                >
                  当前浏览器无法播放这段录音，但原始录音仍可以先保存到本地。
                </p>
              ) : (
                <audio
                  className="mt-4 w-full"
                  controls
                  onError={() => setFailedPreviewUrl(recorder.recording?.previewUrl ?? null)}
                  preload="metadata"
                  src={recorder.recording.previewUrl}
                >
                  当前浏览器无法播放这段录音。
                </audio>
              )}
              <p className="mt-2 text-xs text-garden-muted">
                时长 {formatDuration(recorder.recording.durationMs)} ·{" "}
                {Math.ceil(recorder.recording.sizeBytes / 1024)} KB
              </p>
              <button
                className="mt-4 rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
                disabled={isBusy}
                onClick={() => void recorder.start()}
                type="button"
              >
                重新录制
              </button>
            </div>
          ) : null}
        </section>

        {recorder.status === "preview" ? (
          <>
            <div>
              <label
                className="mb-2 block text-sm font-semibold text-garden-ink"
                htmlFor="create-voice-title"
              >
                标题（可选）
              </label>
              <input
                className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
                disabled={isBusy}
                id="create-voice-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="不填写时使用临时标题"
                type="text"
                value={title}
              />
            </div>
            <div>
              <label
                className="mb-2 block text-sm font-semibold text-garden-ink"
                htmlFor="create-voice-note"
              >
                补充说明（可选）
              </label>
              <textarea
                className="min-h-28 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
                disabled={isBusy}
                id="create-voice-note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="写下你想记住的背景或问题"
                value={note}
              />
            </div>
          </>
        ) : null}

        {displayError !== null ? (
          <p
            aria-live="assertive"
            className="rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
            role="alert"
          >
            {displayError}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-3 border-t border-garden-line px-6 py-4 sm:px-8">
        <button
          className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
          disabled={isBusy}
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <AsyncButton
          className="rounded-full bg-garden-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
          disabled={recorder.status !== "preview" || recorder.recording === null}
          isPending={isSaving || isPending}
          pendingLabel="正在种下…"
          type="submit"
        >
          种下语音
        </AsyncButton>
      </div>
    </form>
  );
}
