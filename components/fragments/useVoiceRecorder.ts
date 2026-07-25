"use client";

import { useEffect, useRef, useState } from "react";

export const VOICE_MAX_DURATION_MS = 3 * 60 * 1_000;
export const VOICE_NEAR_LIMIT_WARNING_MS = 10_000;
export const VOICE_MAX_SIZE_BYTES = 15 * 1024 * 1024;
export const VOICE_MIN_DURATION_MS = 250;

export const VOICE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export type VoiceRecorderStatus =
  "idle" | "requesting_permission" | "recording" | "stopping" | "preview" | "saving" | "error";

export type VoiceRecording = Readonly<{
  blob: Blob;
  mimeType: string;
  previewUrl: string;
  sizeBytes: number;
  durationMs: number;
}>;

export type VoiceRecorderErrorCode =
  | "recording_unsupported"
  | "microphone_permission_denied"
  | "microphone_unavailable"
  | "recording_failed"
  | "empty_recording"
  | "file_too_large";

export type VoiceRecorderError = Readonly<{
  code: VoiceRecorderErrorCode;
  message: string;
}>;

type VoiceRecorderResult = Readonly<{
  status: Exclude<VoiceRecorderStatus, "saving">;
  elapsedMs: number;
  recording: VoiceRecording | null;
  error: VoiceRecorderError | null;
  isBusy: boolean;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
}>;

const ERROR_MESSAGES: Readonly<Record<VoiceRecorderErrorCode, string>> = {
  recording_unsupported: "当前浏览器不支持录音，请改用支持麦克风的安全页面。",
  microphone_permission_denied: "没有获得麦克风权限，因此没有创建语音碎片。你可以重新尝试。",
  microphone_unavailable: "暂时无法使用麦克风，请检查设备是否被其他应用占用。",
  recording_failed: "录音没有完成，语音内容尚未保存。请重新录制。",
  empty_recording: "没有录到有效声音，语音内容尚未保存。请再录一段。",
  file_too_large: "录音超过 15 MB，语音内容尚未保存。请缩短录音后重试。",
};

function getError(code: VoiceRecorderErrorCode): VoiceRecorderError {
  return { code, message: ERROR_MESSAGES[code] };
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function clearTimer(timerRef: { current: number | null }): void {
  if (timerRef.current !== null) {
    window.clearInterval(timerRef.current);
    timerRef.current = null;
  }
}

function chooseMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }

  for (const mimeType of VOICE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    } catch {
      // A browser may expose MediaRecorder but reject MIME probing.
    }
  }

  return null;
}

export function useVoiceRecorder(): VoiceRecorderResult {
  const [status, setStatus] = useState<Exclude<VoiceRecorderStatus, "saving">>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<VoiceRecorderError | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

  function releasePreview(): void {
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function releaseRecorder(): void {
    const recorder = recorderRef.current;
    if (recorder !== null) {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // The stream is still stopped below when a browser rejects a late stop.
        }
      }
    }
    recorderRef.current = null;
    stopTracks(streamRef.current);
    streamRef.current = null;
    clearTimer(timerRef);
    startedAtRef.current = null;
    chunksRef.current = [];
  }

  function fail(code: VoiceRecorderErrorCode, generation: number): void {
    releaseRecorder();
    releasePreview();
    if (!mountedRef.current || generationRef.current !== generation) {
      return;
    }
    setRecording(null);
    setElapsedMs(0);
    setError(getError(code));
    setStatus("error");
  }

  function finishRecording(generation: number, recorder: MediaRecorder, mimeType: string): void {
    const startedAt = startedAtRef.current;
    const durationMs = Math.min(
      VOICE_MAX_DURATION_MS,
      Math.max(0, startedAt === null ? 0 : Date.now() - startedAt),
    );
    const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
    releaseRecorder();

    if (!mountedRef.current || generationRef.current !== generation) {
      return;
    }
    if (blob.size === 0 || (durationMs < VOICE_MIN_DURATION_MS && blob.size < 1_024)) {
      fail("empty_recording", generation);
      return;
    }
    if (blob.size > VOICE_MAX_SIZE_BYTES) {
      fail("file_too_large", generation);
      return;
    }

    releasePreview();
    const previewUrl = URL.createObjectURL(blob);
    previewUrlRef.current = previewUrl;
    setRecording({
      blob,
      durationMs,
      mimeType: blob.type || mimeType,
      previewUrl,
      sizeBytes: blob.size,
    });
    setElapsedMs(durationMs);
    setError(null);
    setStatus("preview");
  }

  async function start(): Promise<void> {
    if (status === "requesting_permission" || status === "recording" || status === "stopping") {
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    releaseRecorder();
    releasePreview();
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setStatus("requesting_permission");

    if (
      typeof window === "undefined" ||
      !window.isSecureContext ||
      navigator.mediaDevices?.getUserMedia === undefined ||
      typeof MediaRecorder === "undefined"
    ) {
      fail("recording_unsupported", generation);
      return;
    }

    const mimeType = chooseMimeType();
    if (mimeType === null) {
      fail("recording_unsupported", generation);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      if (generationRef.current !== generation) return;
      const name = cause instanceof DOMException ? cause.name : "";
      fail(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "microphone_permission_denied"
          : "microphone_unavailable",
        generation,
      );
      return;
    }

    if (!mountedRef.current || generationRef.current !== generation) {
      stopTracks(stream);
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      stopTracks(stream);
      fail("recording_unsupported", generation);
      return;
    }

    chunksRef.current = [];
    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.ondataavailable = (event: BlobEvent) => {
      if (generationRef.current === generation && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onerror = () => fail("recording_failed", generation);
    recorder.onstop = () => finishRecording(generation, recorder, mimeType);

    try {
      recorder.start(250);
    } catch {
      fail("recording_failed", generation);
      return;
    }

    setStatus("recording");
    timerRef.current = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      const nextElapsed = startedAt === null ? 0 : Date.now() - startedAt;
      if (!mountedRef.current || generationRef.current !== generation) return;
      setElapsedMs(Math.min(VOICE_MAX_DURATION_MS, nextElapsed));
      if (nextElapsed >= VOICE_MAX_DURATION_MS && recorderRef.current === recorder) {
        setStatus("stopping");
        try {
          recorder.stop();
        } catch {
          fail("recording_failed", generation);
        }
      }
    }, 250);
  }

  function stop(): void {
    const recorder = recorderRef.current;
    if (status !== "recording" || recorder === null) return;
    setStatus("stopping");
    try {
      recorder.stop();
    } catch {
      fail("recording_failed", generationRef.current);
    }
  }

  function cancel(): void {
    generationRef.current += 1;
    releaseRecorder();
    releasePreview();
    setRecording(null);
    setElapsedMs(0);
    setError(null);
    setStatus("idle");
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      releaseRecorder();
      releasePreview();
    };
  }, []);

  return {
    cancel,
    elapsedMs,
    error,
    isBusy: status === "requesting_permission" || status === "recording" || status === "stopping",
    recording,
    start,
    status,
    stop,
  };
}

export { ERROR_MESSAGES as VOICE_RECORDER_ERROR_MESSAGES };
