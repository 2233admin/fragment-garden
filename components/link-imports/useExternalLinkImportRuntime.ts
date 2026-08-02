"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  ExternalLinkImportManager,
  type ExternalLinkImportManagerEvent,
} from "@/services/external-link-import-manager";

export type ExternalLinkImportRuntime = Readonly<{
  retryExternalLinkImport: (fragmentId: string) => Promise<void>;
  startExternalLinkImport: (fragmentId: string) => void;
}>;

export function useExternalLinkImportRuntime(
  onEvent: (event: ExternalLinkImportManagerEvent) => void,
): ExternalLinkImportRuntime {
  const managerRef = useRef<ExternalLinkImportManager | null>(null);

  useEffect(() => {
    const manager = new ExternalLinkImportManager({ onEvent });
    managerRef.current = manager;
    void manager.resumePendingLinkImports().catch(() => {
      onEvent({
        type: "failed",
        fragmentId: "",
        message: "暂时无法恢复未完成的链接读取。本地内容仍然保留。",
      });
    });

    function resumeWhenOnline(): void {
      void manager.resumePendingLinkImports().catch(() => undefined);
    }

    window.addEventListener("online", resumeWhenOnline);
    return () => {
      window.removeEventListener("online", resumeWhenOnline);
      manager.dispose();
      if (managerRef.current === manager) {
        managerRef.current = null;
      }
    };
  }, [onEvent]);

  const startExternalLinkImport = useCallback((fragmentId: string): void => {
    const manager = managerRef.current;
    if (manager === null) {
      throw new Error("External link import runtime is not ready");
    }
    manager.startExternalLinkImport(fragmentId);
  }, []);

  const retryExternalLinkImport = useCallback(async (fragmentId: string): Promise<void> => {
    const manager = managerRef.current;
    if (manager === null) {
      throw new Error("External link import runtime is not ready");
    }
    await manager.retryExternalLinkImport(fragmentId);
  }, []);

  return { retryExternalLinkImport, startExternalLinkImport };
}
