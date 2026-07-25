import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __voiceRecorderTestState?: {
      getUserMediaCalls: number;
      stoppedTracks: number;
    };
  }
}

type ExperimentalVoiceRecorderOptions = {
  permission?: "granted" | "denied";
};

/** Retained for explicit Post-MVP voice E2E; the default product suite does not enable it. */
export async function installExperimentalVoiceRecorderStub(
  page: Page,
  options: ExperimentalVoiceRecorderOptions = {},
): Promise<void> {
  await page.addInitScript((permission) => {
    class FakeTrack {
      stopped = false;

      stop(): void {
        this.stopped = true;
      }
    }

    class FakeStream {
      private readonly tracks = [new FakeTrack()];

      getTracks(): FakeTrack[] {
        return this.tracks;
      }
    }

    class FakeMediaRecorder {
      static isTypeSupported(type: string): boolean {
        return type === "audio/webm;codecs=opus";
      }

      readonly mimeType = "audio/webm;codecs=opus";
      state: "inactive" | "recording" = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;

      start(): void {
        this.state = "recording";
      }

      stop(): void {
        if (this.state === "inactive") {
          return;
        }
        this.ondataavailable?.({
          data: new Blob(["controlled voice recording"], { type: this.mimeType }),
        });
        this.state = "inactive";
        this.onstop?.();
      }
    }

    const state = { getUserMediaCalls: 0, stoppedTracks: 0 };
    Object.defineProperty(window, "__voiceRecorderTestState", {
      configurable: true,
      value: state,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          state.getUserMediaCalls += 1;
          if (permission === "denied") {
            throw new DOMException("permission denied", "NotAllowedError");
          }

          const stream = new FakeStream();
          const originalGetTracks = stream.getTracks.bind(stream);
          stream.getTracks = () =>
            originalGetTracks().map((track) => {
              const originalStop = track.stop.bind(track);
              track.stop = () => {
                if (!track.stopped) {
                  state.stoppedTracks += 1;
                }
                originalStop();
              };
              return track;
            });
          return stream;
        },
      },
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  }, options.permission ?? "granted");
}
