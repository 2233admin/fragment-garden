"use client";

import { useCallback, useState } from "react";

import type { CompanionAction } from "@/domain/companion/local-response-engine";
import { acceptGetNoteDisclosure } from "@/services/accept-getnote-disclosure";
import { appendAssistantCompanionMessage } from "@/services/append-companion-message";
import { appendCompanionAssistantMessageOnce } from "@/services/companion-message-persistence";
import { createLocalLinkFragment } from "@/services/create-local-link-fragment";

export const COMPANION_LINK_SAVED_MESSAGE = "链接已经先种下了，我正在帮你读取内容。";
export const COMPANION_DUPLICATE_LINK_MESSAGE =
  "这个链接已经种过了。你可以打开已有碎片，或明确选择再种一株。";

type DuplicateLinkState = Readonly<{
  existingFragmentId: string;
  existingTitle: string;
  sourceUrl: string;
  title: string | null;
  requestId?: string;
}>;

type PendingLinkInput = Readonly<{
  sourceUrl: string;
  title: string | null;
  requestId?: string;
}>;

type UseCompanionLinkImportOptions = Readonly<{
  disclosureAcceptedAt: string | null;
  onChatOpenChange: (isOpen: boolean) => void;
  onOpenFragment: (
    fragmentId: string,
    triggerElement: HTMLButtonElement | null,
  ) => Promise<boolean>;
  onStartLinkImport: (fragmentId: string) => void;
  onToolFragmentCreated?: (fragment: { id: string; title: string; status: string }) => void;
}>;

type CompanionLinkImportFlow = Readonly<{
  disclosureErrorMessage: string | null;
  duplicateLink: DuplicateLinkState | null;
  errorMessage: string | null;
  handleAction: (action: CompanionAction | null) => Promise<void>;
  isDisclosureOpen: boolean;
  isPending: boolean;
  acceptDisclosure: () => Promise<void>;
  cancelDisclosure: () => void;
  cancelDuplicate: () => void;
  createDuplicate: () => Promise<void>;
  openExisting: (triggerElement: HTMLButtonElement) => Promise<void>;
}>;

function now(): string {
  return new Date().toISOString();
}

export function useCompanionLinkImport({
  disclosureAcceptedAt,
  onChatOpenChange,
  onOpenFragment,
  onStartLinkImport,
  onToolFragmentCreated,
}: UseCompanionLinkImportOptions): CompanionLinkImportFlow {
  const [pendingDisclosureLink, setPendingDisclosureLink] = useState<PendingLinkInput | null>(null);
  const [duplicateLink, setDuplicateLink] = useState<DuplicateLinkState | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [disclosureErrorMessage, setDisclosureErrorMessage] = useState<string | null>(null);

  const createLink = useCallback(
    async (
      sourceUrl: string,
      allowDuplicate: boolean,
      title?: string | null,
      requestId?: string,
    ): Promise<void> => {
      setErrorMessage(null);
      const result = await createLocalLinkFragment({
        sourceUrl,
        title: title ?? undefined,
        initiatedBy: "companion",
        allowDuplicate,
        now: now(),
      });

      if (result.kind === "duplicate") {
        onToolFragmentCreated?.({
          id: result.fragment.id,
          title: result.fragment.title || "未命名碎片",
          status: result.fragment.lifecycleStatus,
        });
        try {
          if (requestId === undefined) {
            await appendAssistantCompanionMessage({
              content: COMPANION_DUPLICATE_LINK_MESSAGE,
              fragmentId: result.fragment.id,
              now: now(),
            });
          } else {
            await appendCompanionAssistantMessageOnce({
              content: COMPANION_DUPLICATE_LINK_MESSAGE,
              fragmentId: result.fragment.id,
              clientRequestId: `${requestId}:tool`,
              source: "tool",
              now: now(),
            });
          }
        } catch {
          setErrorMessage("已找到原来的链接碎片，但伙伴提示消息没有保存。");
        }
        setDuplicateLink({
          existingFragmentId: result.fragment.id,
          existingTitle: result.fragment.title,
          sourceUrl,
          title: title ?? null,
          requestId,
        });
        setPendingDisclosureLink(null);
        onChatOpenChange(false);
        return;
      }

      onToolFragmentCreated?.({
        id: result.fragment.id,
        title: result.fragment.title || "未命名碎片",
        status: result.fragment.lifecycleStatus,
      });

      let statusMessageWasSaved = true;
      try {
        if (requestId === undefined) {
          await appendAssistantCompanionMessage({
            content: COMPANION_LINK_SAVED_MESSAGE,
            fragmentId: result.fragment.id,
            now: now(),
          });
        } else {
          await appendCompanionAssistantMessageOnce({
            content: COMPANION_LINK_SAVED_MESSAGE,
            fragmentId: result.fragment.id,
            clientRequestId: `${requestId}:tool`,
            source: "tool",
            now: now(),
          });
        }
      } catch {
        statusMessageWasSaved = false;
      }

      try {
        onStartLinkImport(result.fragment.id);
        setErrorMessage(
          statusMessageWasSaved ? null : "链接已经保存在本地并开始读取，但伙伴状态消息没有保存。",
        );
      } catch {
        setErrorMessage("链接已保存在本地，但读取任务尚未启动。刷新页面后会继续尝试。");
      }

      setPendingDisclosureLink(null);
      setDuplicateLink(null);
      onChatOpenChange(true);
    },
    [onChatOpenChange, onStartLinkImport, onToolFragmentCreated],
  );

  const handleAction = useCallback(
    async (action: CompanionAction | null): Promise<void> => {
      if (action?.type !== "IMPORT_LINK") {
        return;
      }

      setErrorMessage(null);
      setDisclosureErrorMessage(null);
      if (disclosureAcceptedAt === null) {
        setPendingDisclosureLink({
          sourceUrl: action.url,
          title: action.title ?? null,
          requestId: action.requestId,
        });
        onChatOpenChange(false);
        return;
      }

      setIsPending(true);
      try {
        await createLink(action.url, false, action.title, action.requestId);
      } catch {
        setErrorMessage("链接没有保存，因此没有提交给第三方。请检查链接后重试。");
      } finally {
        setIsPending(false);
      }
    },
    [createLink, disclosureAcceptedAt, onChatOpenChange],
  );

  const acceptDisclosure = useCallback(async (): Promise<void> => {
    if (pendingDisclosureLink === null || isPending) {
      return;
    }

    setIsPending(true);
    setDisclosureErrorMessage(null);
    try {
      await acceptGetNoteDisclosure({ now: now() });
      await createLink(
        pendingDisclosureLink.sourceUrl,
        false,
        pendingDisclosureLink.title,
        pendingDisclosureLink.requestId,
      );
    } catch {
      setDisclosureErrorMessage("第三方处理选择或链接没有保存，因此没有发出读取请求。请重试。");
    } finally {
      setIsPending(false);
    }
  }, [createLink, isPending, pendingDisclosureLink]);

  const cancelDisclosure = useCallback((): void => {
    if (isPending) {
      return;
    }

    setPendingDisclosureLink(null);
    setDisclosureErrorMessage(null);
    onChatOpenChange(true);
  }, [isPending, onChatOpenChange]);

  const cancelDuplicate = useCallback((): void => {
    if (isPending) {
      return;
    }

    setDuplicateLink(null);
    setErrorMessage(null);
    onChatOpenChange(true);
  }, [isPending, onChatOpenChange]);

  const createDuplicate = useCallback(async (): Promise<void> => {
    if (duplicateLink === null || isPending) {
      return;
    }

    setIsPending(true);
    try {
      await createLink(duplicateLink.sourceUrl, true, duplicateLink.title, duplicateLink.requestId);
    } catch {
      setErrorMessage("新的链接碎片没有保存，也没有发出读取请求。请重试。");
    } finally {
      setIsPending(false);
    }
  }, [createLink, duplicateLink, isPending]);

  const openExisting = useCallback(
    async (triggerElement: HTMLButtonElement): Promise<void> => {
      if (duplicateLink === null || isPending) {
        return;
      }

      const currentDuplicate = duplicateLink;
      setDuplicateLink(null);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const didOpen = await onOpenFragment(currentDuplicate.existingFragmentId, triggerElement);
        if (didOpen) {
          return;
        }
      } catch {
        // Restore the duplicate choice below so a transient detail failure is recoverable.
      }

      setDuplicateLink(currentDuplicate);
      setErrorMessage("已有碎片暂时没有打开，请重试。");
    },
    [duplicateLink, isPending, onOpenFragment],
  );

  return {
    disclosureErrorMessage,
    duplicateLink,
    errorMessage,
    handleAction,
    isDisclosureOpen: pendingDisclosureLink !== null,
    isPending,
    acceptDisclosure,
    cancelDisclosure,
    cancelDuplicate,
    createDuplicate,
    openExisting,
  };
}
