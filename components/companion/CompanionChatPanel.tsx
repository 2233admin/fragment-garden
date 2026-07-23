"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { ChatMessageRole, CompanionType } from "@/domain";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";
import { CompanionMark } from "./CompanionMark";
import {
  FragmentRecommendationCard,
  type FragmentRecommendationView,
  type RecommendationPendingAction,
} from "./FragmentRecommendationCard";

export type CompanionMessageView = {
  content: string;
  createdAt: string;
  fragmentId: string | null;
  id: string;
  role: ChatMessageRole;
};

export type CompanionChatPanelProps = {
  companionType: CompanionType;
  errorMessage: string | null;
  isLoading: boolean;
  isOpen: boolean;
  isPending?: boolean;
  messages: readonly CompanionMessageView[];
  recommendation: FragmentRecommendationView | null;
  onClose: () => void;
  onDismissRecommendation: () => Promise<void>;
  onOpenLinkedFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => Promise<void>;
  onOpenRecommendation: () => Promise<void>;
  onSend: (content: string) => Promise<void>;
};

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatMessageTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? "时间未知" : MESSAGE_TIME_FORMATTER.format(timestamp);
}

export function CompanionChatPanel({
  companionType,
  errorMessage,
  isLoading,
  isOpen,
  isPending = false,
  messages,
  recommendation,
  onClose,
  onDismissRecommendation,
  onOpenLinkedFragment,
  onOpenRecommendation,
  onSend,
}: CompanionChatPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const messageEndRef = useRef<HTMLDivElement>(null);
  const submissionLockRef = useRef(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [recommendationAction, setRecommendationAction] =
    useState<RecommendationPendingAction>(null);
  const [openingFragmentId, setOpeningFragmentId] = useState<string | null>(null);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  const isBusy =
    isPending || isSending || recommendationAction !== null || openingFragmentId !== null;
  const displayedErrorMessage = localErrorMessage ?? errorMessage;

  useEffect(() => {
    if (isOpen) {
      messageEndRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isLoading, isOpen, messages.length, recommendation]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape" || isBusy) {
        return;
      }

      event.preventDefault();
      setLocalErrorMessage(null);
      onClose();
    }

    document.addEventListener("keydown", handleEscape, true);

    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [isBusy, isOpen, onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isPending || recommendationAction !== null) {
      return;
    }

    const normalizedDraft = draft.trim();

    if (normalizedDraft.length === 0) {
      return;
    }

    submissionLockRef.current = true;
    setIsSending(true);
    setLocalErrorMessage(null);

    try {
      await onSend(normalizedDraft);
      setDraft("");
    } catch {
      setLocalErrorMessage("消息没有保存，因此伙伴没有回复。你的输入仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsSending(false);
    }
  }

  async function handleRecommendationAction(action: Exclude<RecommendationPendingAction, null>) {
    if (isBusy) {
      return;
    }

    setRecommendationAction(action);
    setLocalErrorMessage(null);

    try {
      if (action === "opening") {
        await onOpenRecommendation();
      } else {
        await onDismissRecommendation();
      }
    } catch {
      setLocalErrorMessage(
        action === "opening"
          ? "推荐状态没有保存，因此内容没有打开。请重试。"
          : "推荐状态没有保存，这条内容仍在原处。请重试。",
      );
    } finally {
      setRecommendationAction(null);
    }
  }

  async function handleOpenLinkedFragment(
    fragmentId: string,
    triggerElement: HTMLButtonElement,
  ): Promise<void> {
    if (isBusy) {
      return;
    }

    setOpeningFragmentId(fragmentId);
    setLocalErrorMessage(null);
    try {
      await onOpenLinkedFragment(fragmentId, triggerElement);
    } catch {
      setLocalErrorMessage("这株植物暂时没有打开。链接和读取结果仍保存在本地，请重试。");
    } finally {
      setOpeningFragmentId(null);
    }
  }

  function handleRequestClose(): void {
    if (!isBusy) {
      setLocalErrorMessage(null);
      onClose();
    }
  }

  return (
    <ModalDialog
      className="m-auto flex h-[min(88vh,48rem)] w-[min(94vw,32rem)] flex-col overflow-hidden rounded-3xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isBusy}
      labelledBy={titleId}
      onRequestClose={handleRequestClose}
    >
      <header className="flex items-start justify-between gap-4 border-b border-garden-line bg-garden-paper px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <CompanionMark companionType={companionType} size="medium" />
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-garden-accent uppercase">
              本地花园对话
            </p>
            <h2 className="font-display text-2xl font-semibold text-garden-ink" id={titleId}>
              花园伙伴
            </h2>
            <p className="sr-only" id={descriptionId}>
              询问花园使用方法、植物状态，或请伙伴带你重新看看以前种下的内容。
            </p>
          </div>
        </div>
        <button
          aria-label="关闭花园伙伴"
          className="shrink-0 rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
          disabled={isBusy}
          onClick={handleRequestClose}
          type="button"
        >
          关闭
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-garden-canvas/35 px-4 py-5 sm:px-5">
        <ol
          aria-busy={isLoading}
          aria-label="与花园伙伴的消息"
          aria-live="polite"
          aria-relevant="additions text"
          className="space-y-3"
          role="log"
        >
          {messages.map((message) => {
            const isUser = message.role === "user";
            const linkedFragmentId = message.fragmentId;

            return (
              <li className={`flex ${isUser ? "justify-end" : "justify-start"}`} key={message.id}>
                <article
                  className={`max-w-[86%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? "rounded-br-md bg-garden-accent text-white"
                      : "rounded-bl-md border border-garden-line bg-garden-paper text-garden-ink"
                  }`}
                >
                  <p className="sr-only">{isUser ? "你说：" : "花园伙伴说："}</p>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {linkedFragmentId !== null ? (
                    <button
                      className={`mt-3 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${
                        isUser
                          ? "border-white/55 text-white hover:bg-white/10"
                          : "border-garden-accent text-garden-accent hover:bg-garden-soft"
                      }`}
                      disabled={isBusy}
                      onClick={(event) =>
                        void handleOpenLinkedFragment(linkedFragmentId, event.currentTarget)
                      }
                      type="button"
                    >
                      {openingFragmentId === linkedFragmentId ? "正在打开…" : "打开这株植物"}
                    </button>
                  ) : null}
                  <time
                    className={`mt-1 block text-right text-[0.68rem] ${
                      isUser ? "text-white/75" : "text-garden-muted"
                    }`}
                    dateTime={message.createdAt}
                  >
                    {formatMessageTime(message.createdAt)}
                  </time>
                </article>
              </li>
            );
          })}
        </ol>

        {isLoading ? (
          <p
            aria-live="polite"
            className="py-8 text-center text-sm font-semibold text-garden-muted"
          >
            正在读取本地对话…
          </p>
        ) : messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-garden-line bg-garden-paper px-4 py-6 text-center text-sm leading-6 text-garden-muted">
            还没有对话。可以先问问这里能做什么。
          </p>
        ) : null}

        {recommendation !== null ? (
          <div className="mt-4">
            <FragmentRecommendationCard
              onDismiss={() => void handleRecommendationAction("dismissing")}
              onOpen={() => void handleRecommendationAction("opening")}
              pendingAction={recommendationAction}
              recommendation={recommendation}
            />
          </div>
        ) : null}
        <div ref={messageEndRef} />
      </div>

      <footer className="border-t border-garden-line bg-garden-paper px-4 py-4 sm:px-5">
        <div
          aria-atomic="true"
          aria-live={displayedErrorMessage === null ? "polite" : "assertive"}
          className="min-h-6 text-sm"
          role={displayedErrorMessage === null ? "status" : "alert"}
        >
          {displayedErrorMessage !== null ? (
            <p className="font-semibold leading-5 text-garden-danger">{displayedErrorMessage}</p>
          ) : isSending ? (
            <p className="font-semibold leading-5 text-garden-accent">正在保存并准备回复…</p>
          ) : null}
        </div>

        <form className="mt-2 flex items-end gap-2" onSubmit={handleSubmit}>
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-sm font-semibold text-garden-ink" htmlFor={inputId}>
              想问些什么？
            </label>
            <input
              autoFocus
              className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/80 disabled:opacity-60"
              disabled={isBusy || isLoading}
              id={inputId}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：植物为什么休眠？"
              required
              type="text"
              value={draft}
            />
          </div>
          <AsyncButton
            className="rounded-full bg-garden-accent px-5 py-3 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={isLoading || draft.trim().length === 0}
            isPending={isBusy}
            pendingLabel="处理中…"
            type="submit"
          >
            发送
          </AsyncButton>
        </form>
      </footer>
    </ModalDialog>
  );
}
