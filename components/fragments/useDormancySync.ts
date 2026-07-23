"use client";

import { useEffect, useRef } from "react";

import { applyDormancyTransitions } from "@/services/apply-dormancy-transitions";

export type DormancySyncFeedback = Readonly<{
  kind: "status" | "error";
  message: string;
}>;

type UseDormancySyncOptions = {
  onFeedback: (feedback: DormancySyncFeedback) => void;
};

export function useDormancySync({ onFeedback }: UseDormancySyncOptions): void {
  const isMountedRef = useRef(false);
  const isRunningRef = useRef(false);
  const onFeedbackRef = useRef(onFeedback);

  useEffect(() => {
    onFeedbackRef.current = onFeedback;
  }, [onFeedback]);

  useEffect(() => {
    isMountedRef.current = true;

    async function synchronizeDormancy(): Promise<void> {
      if (isRunningRef.current) {
        return;
      }

      isRunningRef.current = true;
      const now = new Date().toISOString();

      try {
        const result = await applyDormancyTransitions({ now });

        if (isMountedRef.current && result.transitions.length > 0) {
          onFeedbackRef.current({
            kind: "status",
            message: `${result.transitions.length} 条久未互动的碎片已安静地进入休眠，内容没有消失。`,
          });
        }
      } catch {
        if (isMountedRef.current) {
          onFeedbackRef.current({
            kind: "error",
            message: "这次没有完成休眠状态同步，现有内容没有被修改，仍可继续查看和整理。",
          });
        }
      } finally {
        isRunningRef.current = false;
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void synchronizeDormancy();
      }
    }

    void synchronizeDormancy();
    window.addEventListener("focus", synchronizeDormancy);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("focus", synchronizeDormancy);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
