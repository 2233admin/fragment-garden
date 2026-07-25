"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { filterFragmentCardsByStatus, type FragmentCardFilter } from "@/domain";
import {
  filterAndSortFragmentCards,
  listFragmentCardViewModels,
  type FragmentCardSort,
  type FragmentCardViewModel,
} from "@/data/queries/fragment-card-query";
import { acceptImageDisclosure } from "@/services/accept-image-disclosure";
import { acceptVoiceDisclosure } from "@/services/accept-voice-disclosure";
import {
  markStaleImageProcessing,
  processImageAnalysis,
  setImageLocalOnly,
} from "@/services/image-media-processing";
import {
  markStaleAudioProcessing,
  processAudioTranscription,
  setAudioLocalOnly,
} from "@/services/audio-media-processing";
import { queryLocalSettings } from "@/data/queries/companion-query";

import { CreateFragmentDialog, type CreatedFragmentNotice } from "./CreateFragmentDialog";
import { ImageDisclosureDialog } from "./ImageDisclosureDialog";
import { VoiceDisclosureDialog } from "./VoiceDisclosureDialog";
import { EmptyFragmentState } from "./EmptyFragmentState";
import { FragmentList } from "./FragmentList";
import { FragmentSearchBar } from "./FragmentSearchBar";
import { FragmentStatusFilter } from "./FragmentStatusFilter";

type CardQueryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; cards: FragmentCardViewModel[] };

type MediaDisclosureRequest = Readonly<{
  assetId: string;
  fragmentId: string;
}>;

const LOADING_CARD_STATE: CardQueryState = { status: "loading" };
const MAX_IMAGE_PROCESSING_CONCURRENCY = 2;

const FILTER_EMPTY_MESSAGES: Readonly<Record<FragmentCardFilter, string>> = {
  current: "当前没有可显示的碎片。已封存的内容仍可从“已封存”中找到。",
  dormant: "现在没有正在休眠的碎片。",
  completed: "现在还没有已完成的碎片。",
  archived: "现在还没有已封存的碎片。",
};

type FragmentWorkspaceProps = {
  layout?: "page" | "embedded";
  onOpenFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  openingFragmentId: string | null;
  /** Monotonic external request counter for opening the existing create dialog. */
  openCreateRequest?: number;
  onExternalCreateCompleted?: (notice: CreatedFragmentNotice) => void;
  onRetryLinkImport?: (fragmentId: string) => Promise<void>;
  onStartLinkImport?: (fragmentId: string) => void;
};

export function FragmentWorkspace({
  layout = "page",
  onOpenFragment,
  openingFragmentId,
  openCreateRequest,
  onExternalCreateCompleted,
  onRetryLinkImport,
  onStartLinkImport,
}: FragmentWorkspaceProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<FragmentCardSort>("created_desc");
  const [statusFilter, setStatusFilter] = useState<FragmentCardFilter>("current");
  const [queryAttempt, setQueryAttempt] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [imageDisclosure, setImageDisclosure] = useState<MediaDisclosureRequest | null>(null);
  const [imageDisclosureDialogKey, setImageDisclosureDialogKey] = useState("image-disclosure");
  const [imageDisclosureError, setImageDisclosureError] = useState<string | null>(null);
  const [isImageDisclosurePending, setIsImageDisclosurePending] = useState(false);
  const [voiceDisclosure, setVoiceDisclosure] = useState<MediaDisclosureRequest | null>(null);
  const [voiceDisclosureDialogKey, setVoiceDisclosureDialogKey] = useState("voice-disclosure");
  const [voiceDisclosureError, setVoiceDisclosureError] = useState<string | null>(null);
  const [isVoiceDisclosurePending, setIsVoiceDisclosurePending] = useState(false);
  const imageProcessingActiveRef = useRef(new Set<string>());
  const imageProcessingQueueRef = useRef<string[]>([]);
  const imageProcessingDrainRef = useRef(false);
  const voiceProcessingLockRef = useRef(false);
  const voiceProcessingActiveAssetRef = useRef<string | null>(null);
  const voiceProcessingQueueRef = useRef<string[]>([]);
  const imageDisclosureRef = useRef<MediaDisclosureRequest | null>(null);
  const imageDisclosureQueueRef = useRef<MediaDisclosureRequest[]>([]);
  const voiceDisclosureRef = useRef<MediaDisclosureRequest | null>(null);
  const voiceDisclosureQueueRef = useRef<MediaDisclosureRequest[]>([]);
  const seedButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceRootRef = useRef<HTMLDivElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handledOpenCreateRequestRef = useRef(0);
  const isExternalCreateRequestRef = useRef(false);
  const pendingOpenCreateRequestRef = useRef<number | null>(null);

  useEffect(() => {
    void markStaleImageProcessing(new Date(Date.now() - 15 * 60 * 1000));
    void markStaleAudioProcessing(new Date(Date.now() - 15 * 60 * 1000));
  }, []);

  useEffect(() => {
    if (
      openCreateRequest === undefined ||
      openCreateRequest <= handledOpenCreateRequestRef.current ||
      pendingOpenCreateRequestRef.current === openCreateRequest
    ) {
      return;
    }

    pendingOpenCreateRequestRef.current = openCreateRequest;
    let frame = 0;

    const openWhenVisible = (): void => {
      const root = workspaceRootRef.current;
      const isVisible = root !== null && root.getClientRects().length > 0;

      if (!isVisible) {
        frame = requestAnimationFrame(openWhenVisible);
        return;
      }

      handledOpenCreateRequestRef.current = openCreateRequest;
      pendingOpenCreateRequestRef.current = null;
      isExternalCreateRequestRef.current = true;
      createTriggerRef.current = null;
      setFeedback(null);
      setIsCreateOpen(true);
    };

    frame = requestAnimationFrame(openWhenVisible);

    return () => {
      cancelAnimationFrame(frame);
      if (pendingOpenCreateRequestRef.current === openCreateRequest) {
        pendingOpenCreateRequestRef.current = null;
      }
    };
  }, [layout, openCreateRequest]);

  const cardState: CardQueryState = useLiveQuery(
    async (): Promise<CardQueryState> => {
      try {
        return {
          status: "ready",
          cards: await listFragmentCardViewModels(),
        };
      } catch {
        return { status: "error" };
      }
    },
    [queryAttempt],
    LOADING_CARD_STATE,
  );

  const statusFilteredCards =
    cardState.status === "ready" ? filterFragmentCardsByStatus(cardState.cards, statusFilter) : [];
  const visibleCards = filterAndSortFragmentCards(statusFilteredCards, searchTerm, sort);

  function restoreFocus(preferredTarget: HTMLButtonElement | null): void {
    requestAnimationFrame(() => {
      if (preferredTarget?.isConnected) {
        preferredTarget.focus();
      } else {
        seedButtonRef.current?.focus();
      }
    });
  }

  function openCreateDialog(triggerElement: HTMLButtonElement): void {
    isExternalCreateRequestRef.current = false;
    createTriggerRef.current = triggerElement;
    setFeedback(null);
    setIsCreateOpen(true);
  }

  function closeCreateDialog(): void {
    setIsCreateOpen(false);
    isExternalCreateRequestRef.current = false;
    restoreFocus(createTriggerRef.current);
  }

  function openImageDisclosure(request: MediaDisclosureRequest): void {
    if (
      imageDisclosureRef.current?.assetId === request.assetId ||
      imageDisclosureQueueRef.current.some((queued) => queued.assetId === request.assetId)
    ) {
      return;
    }

    if (imageDisclosureRef.current !== null) {
      imageDisclosureQueueRef.current.push(request);
      setFeedback("另一张图片正在等待隐私选择；这张图片稍后可以在详情中开始分析。");
      return;
    }

    imageDisclosureRef.current = request;
    setImageDisclosureDialogKey(request.assetId);
    setImageDisclosureError(null);
    setImageDisclosure(request);
  }

  function closeImageDisclosure(): void {
    imageDisclosureRef.current = null;
    setImageDisclosure(null);
    setImageDisclosureError(null);
    const next = imageDisclosureQueueRef.current.shift();
    if (next !== undefined) {
      imageDisclosureRef.current = next;
      setImageDisclosureDialogKey(next.assetId);
      setImageDisclosure(next);
    }
  }

  function openVoiceDisclosure(request: MediaDisclosureRequest): void {
    if (
      voiceDisclosureRef.current?.assetId === request.assetId ||
      voiceDisclosureQueueRef.current.some((queued) => queued.assetId === request.assetId)
    ) {
      return;
    }

    if (voiceDisclosureRef.current !== null) {
      voiceDisclosureQueueRef.current.push(request);
      setFeedback("另一段语音正在等待隐私选择；这段录音稍后可以在详情中开始转写。");
      return;
    }

    voiceDisclosureRef.current = request;
    setVoiceDisclosureDialogKey(request.assetId);
    setVoiceDisclosureError(null);
    setVoiceDisclosure(request);
  }

  function closeVoiceDisclosure(): void {
    voiceDisclosureRef.current = null;
    setVoiceDisclosure(null);
    setVoiceDisclosureError(null);
    const next = voiceDisclosureQueueRef.current.shift();
    if (next !== undefined) {
      voiceDisclosureRef.current = next;
      setVoiceDisclosureDialogKey(next.assetId);
      setVoiceDisclosure(next);
    }
  }

  async function executeImageProcessing(assetId: string): Promise<void> {
    try {
      const result = await processImageAnalysis(assetId);
      if (result === null) {
        setFeedback("这次图片分析结果已过期，原图仍保存在本地，可以在详情中重试。");
        return;
      }
      setFeedback("图片分析已完成，原图和结果都保存在本地。");
    } catch {
      setFeedback("图片已经保存在本地，但分析暂时失败，可以在详情中重试。");
    } finally {
      imageProcessingActiveRef.current.delete(assetId);
      if (imageDisclosureRef.current?.assetId === assetId) {
        closeImageDisclosure();
      }
      drainImageProcessingQueue();
    }
  }

  function drainImageProcessingQueue(): void {
    if (imageProcessingDrainRef.current) return;

    imageProcessingDrainRef.current = true;
    try {
      while (
        imageProcessingActiveRef.current.size < MAX_IMAGE_PROCESSING_CONCURRENCY &&
        imageProcessingQueueRef.current.length > 0
      ) {
        const nextAssetId = imageProcessingQueueRef.current.shift();
        if (nextAssetId === undefined || imageProcessingActiveRef.current.has(nextAssetId)) {
          continue;
        }

        imageProcessingActiveRef.current.add(nextAssetId);
        void executeImageProcessing(nextAssetId);
      }
    } finally {
      imageProcessingDrainRef.current = false;
    }
  }

  function runImageProcessing(assetId: string): void {
    if (
      imageProcessingActiveRef.current.has(assetId) ||
      imageProcessingQueueRef.current.includes(assetId)
    ) {
      return;
    }

    imageProcessingQueueRef.current.push(assetId);
    if (imageProcessingActiveRef.current.size >= MAX_IMAGE_PROCESSING_CONCURRENCY) {
      setFeedback("图片已经保存在本地，前面的分析完成后会继续处理。");
    }
    drainImageProcessingQueue();
  }

  async function startImageProcessingFlow(assetId: string, fragmentId: string): Promise<void> {
    try {
      const settings = await queryLocalSettings();
      if (settings.imageAiDisclosureAcceptedAt !== null) {
        setImageDisclosureError(null);
        runImageProcessing(assetId);
        return;
      }
      openImageDisclosure({ assetId, fragmentId });
    } catch {
      if (imageDisclosureRef.current?.assetId === assetId) {
        closeImageDisclosure();
      }
      setFeedback("暂时无法读取图片分析设置。图片仍保存在本地，请稍后重试。");
    }
  }

  async function acceptImageProcessing(): Promise<void> {
    if (imageDisclosure === null || isImageDisclosurePending) return;
    setIsImageDisclosurePending(true);
    setImageDisclosureError(null);
    try {
      await acceptImageDisclosure({ now: new Date().toISOString() });
      const request = imageDisclosure;
      closeImageDisclosure();
      runImageProcessing(request.assetId);
    } catch {
      setImageDisclosureError("这次选择没有保存，图片仍只保存在本地。请重试。");
    } finally {
      setIsImageDisclosurePending(false);
    }
  }

  async function keepImageLocalOnly(): Promise<void> {
    if (imageDisclosure === null || isImageDisclosurePending) return;
    setIsImageDisclosurePending(true);
    try {
      await setImageLocalOnly(imageDisclosure.assetId);
      setFeedback("图片已保存在本地，没有发送给 OpenAI。");
      closeImageDisclosure();
    } catch {
      setImageDisclosureError("暂时无法更新图片处理状态，图片仍然保存在本地。");
    } finally {
      setIsImageDisclosurePending(false);
    }
  }

  async function executeVoiceProcessing(assetId: string): Promise<void> {
    try {
      const result = await processAudioTranscription(assetId);
      if (result === null) {
        setFeedback("这次语音转写结果已过期，录音仍保存在本地，可以在详情中重试。");
        return;
      }
      setFeedback("语音转写已完成，录音和文字都保存在本地。");
    } catch {
      setFeedback("语音已经保存在本地，但转写暂时失败，可以在详情中重试。");
    } finally {
      voiceProcessingLockRef.current = false;
      voiceProcessingActiveAssetRef.current = null;
      if (voiceDisclosureRef.current?.assetId === assetId) {
        closeVoiceDisclosure();
      }
      const nextAssetId = voiceProcessingQueueRef.current.shift();
      if (nextAssetId !== undefined) {
        voiceProcessingLockRef.current = true;
        voiceProcessingActiveAssetRef.current = nextAssetId;
        void executeVoiceProcessing(nextAssetId);
      }
    }
  }

  function runVoiceProcessing(assetId: string): void {
    if (
      voiceProcessingActiveAssetRef.current === assetId ||
      voiceProcessingQueueRef.current.includes(assetId)
    ) {
      return;
    }

    if (voiceProcessingLockRef.current) {
      voiceProcessingQueueRef.current.push(assetId);
      setFeedback("语音已经保存在本地，前面的转写完成后会继续处理。");
      return;
    }

    voiceProcessingLockRef.current = true;
    voiceProcessingActiveAssetRef.current = assetId;
    void executeVoiceProcessing(assetId);
  }

  async function startVoiceProcessingFlow(assetId: string, fragmentId: string): Promise<void> {
    try {
      const settings = await queryLocalSettings();
      if (settings.voiceAiDisclosureAcceptedAt !== null) {
        setVoiceDisclosureError(null);
        runVoiceProcessing(assetId);
        return;
      }
      openVoiceDisclosure({ assetId, fragmentId });
    } catch {
      if (voiceDisclosureRef.current?.assetId === assetId) {
        closeVoiceDisclosure();
      }
      setFeedback("暂时无法读取语音转写设置。录音仍保存在本地，请稍后重试。");
    }
  }

  async function acceptVoiceProcessing(): Promise<void> {
    if (voiceDisclosure === null || isVoiceDisclosurePending) return;
    setIsVoiceDisclosurePending(true);
    setVoiceDisclosureError(null);
    try {
      await acceptVoiceDisclosure({ now: new Date().toISOString() });
      const request = voiceDisclosure;
      closeVoiceDisclosure();
      runVoiceProcessing(request.assetId);
    } catch {
      setVoiceDisclosureError("这次选择没有保存，录音仍只保存在本地。请重试。");
    } finally {
      setIsVoiceDisclosurePending(false);
    }
  }

  async function keepVoiceLocalOnly(): Promise<void> {
    if (voiceDisclosure === null || isVoiceDisclosurePending) return;
    setIsVoiceDisclosurePending(true);
    try {
      await setAudioLocalOnly(voiceDisclosure.assetId);
      setFeedback("语音已保存在本地，没有发送给 OpenAI。");
      closeVoiceDisclosure();
    } catch {
      setVoiceDisclosureError("暂时无法更新语音处理状态，录音仍然保存在本地。");
    } finally {
      setIsVoiceDisclosurePending(false);
    }
  }

  const WorkspaceRoot = layout === "page" ? "main" : "div";
  const WorkspaceHeading = layout === "page" ? "h1" : "h2";
  const CollectionHeading = layout === "page" ? "h2" : "h3";

  return (
    <WorkspaceRoot
      className={
        layout === "page"
          ? "min-h-screen px-5 py-8 text-garden-ink sm:px-8 lg:px-12 lg:py-10"
          : "pt-7 pb-12 text-garden-ink"
      }
      ref={workspaceRootRef}
    >
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-6 border-b border-garden-line pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-garden-accent uppercase">
              卡片模式
            </p>
            <WorkspaceHeading className="mt-2 font-display text-4xl leading-tight font-semibold tracking-tight text-garden-ink sm:text-5xl">
              {layout === "page" ? "碎片花园" : "我的碎片"}
            </WorkspaceHeading>
            <p className="mt-3 max-w-xl text-sm leading-6 text-garden-muted sm:text-base">
              把暂时不处理、但也不想忘记的内容种下来。所有内容先保存在当前浏览器中。
            </p>
          </div>

          <button
            className="self-start rounded-full bg-garden-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(36,93,69,0.2)] hover:bg-garden-accent-strong sm:self-auto"
            onClick={(event) => openCreateDialog(event.currentTarget)}
            ref={seedButtonRef}
            type="button"
          >
            种下碎片
          </button>
        </header>

        <section className="mt-8" aria-labelledby="fragment-collection-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CollectionHeading
                className="font-display text-2xl font-semibold text-garden-ink"
                id="fragment-collection-title"
              >
                我的碎片
              </CollectionHeading>
              <p className="mt-1 text-sm text-garden-muted">
                {cardState.status === "ready"
                  ? `当前筛选 ${statusFilteredCards.length} 条，共 ${cardState.cards.length} 条未删除碎片`
                  : "正在连接本地花园"}
              </p>
            </div>
            <p className="text-xs text-garden-muted">本地保存 · 无需等待 AI</p>
          </div>

          <div className="mt-5 space-y-4">
            <FragmentStatusFilter onChange={setStatusFilter} value={statusFilter} />
            <FragmentSearchBar
              onSearchTermChange={setSearchTerm}
              onSortChange={setSort}
              searchTerm={searchTerm}
              sort={sort}
            />
          </div>

          <div
            aria-atomic="true"
            aria-live="polite"
            className="mt-4 min-h-6 text-sm font-semibold text-garden-accent"
            role="status"
          >
            {feedback}
          </div>

          {cardState.status === "loading" ? (
            <section
              aria-live="polite"
              className="rounded-2xl border border-garden-line bg-garden-paper px-6 py-14 text-center"
            >
              <h3 className="font-display text-xl font-semibold">正在初始化本地花园…</h3>
              <p className="mt-2 text-sm text-garden-muted">
                正在读取当前浏览器中的 IndexedDB 数据。
              </p>
            </section>
          ) : null}

          {cardState.status === "error" ? (
            <section
              aria-live="assertive"
              className="rounded-2xl bg-garden-danger-soft p-6"
              role="alert"
            >
              <h3 className="font-display text-xl font-semibold text-garden-danger">
                无法读取本地碎片
              </h3>
              <p className="mt-2 text-sm leading-6 text-garden-danger">
                没有数据被修改。请重新读取；如果仍然失败，可以刷新页面后重试。
              </p>
              <button
                className="mt-4 rounded-full border border-garden-danger px-5 py-2.5 text-sm font-semibold text-garden-danger"
                onClick={() => setQueryAttempt((attempt) => attempt + 1)}
                type="button"
              >
                重新读取
              </button>
            </section>
          ) : null}

          {cardState.status === "ready" && cardState.cards.length === 0 ? (
            <EmptyFragmentState onCreate={openCreateDialog} />
          ) : null}

          {cardState.status === "ready" &&
          cardState.cards.length > 0 &&
          statusFilteredCards.length === 0 ? (
            <section
              aria-live="polite"
              className="rounded-2xl border border-dashed border-garden-line bg-garden-paper/75 px-6 py-12 text-center"
            >
              <h3 className="font-display text-xl font-semibold">这个筛选里还没有内容</h3>
              <p className="mt-2 text-sm text-garden-muted">
                {FILTER_EMPTY_MESSAGES[statusFilter]}
              </p>
            </section>
          ) : null}

          {cardState.status === "ready" &&
          statusFilteredCards.length > 0 &&
          visibleCards.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-garden-line bg-garden-paper/75 px-6 py-12 text-center">
              <h3 className="font-display text-xl font-semibold">没有找到匹配的碎片</h3>
              <p className="mt-2 text-sm text-garden-muted">换一个标题或正文关键词试试。</p>
              <button
                className="mt-5 rounded-full border border-garden-accent px-5 py-2.5 text-sm font-semibold text-garden-accent"
                onClick={() => setSearchTerm("")}
                type="button"
              >
                清除搜索
              </button>
            </section>
          ) : null}

          {visibleCards.length > 0 ? (
            <FragmentList
              fragments={visibleCards}
              onOpen={onOpenFragment}
              openingFragmentId={openingFragmentId}
              onRetryLinkImport={onRetryLinkImport}
            />
          ) : null}
        </section>
      </div>

      <CreateFragmentDialog
        isOpen={isCreateOpen}
        onClose={closeCreateDialog}
        onCreated={(notice) => {
          if (notice.contentType === "image") {
            void startImageProcessingFlow(notice.mediaAssetId, notice.fragmentId);
          }
          if (notice.contentType === "audio") {
            void startVoiceProcessingFlow(notice.mediaAssetId, notice.fragmentId);
          }
          if (isExternalCreateRequestRef.current) {
            onExternalCreateCompleted?.(notice);
          }

          if (
            notice.contentType !== "link" &&
            notice.contentType !== "image" &&
            notice.contentType !== "audio"
          ) {
            setFeedback(`“${notice.title}”已保存，并出现在卡片列表中。`);
            return;
          }

          if (notice.contentType === "image") {
            setFeedback("图片已经先种下了。");
            return;
          }

          if (notice.contentType === "audio") {
            setFeedback("语音已经先种下了。");
            return;
          }

          setFeedback(
            notice.linkImportStarted
              ? `“${notice.title}”链接已经种下，正在读取内容。`
              : `“${notice.title}”链接已保存到本地。读取暂时未启动，刷新页面后会继续恢复。`,
          );
        }}
        onOpenExistingFragment={onOpenFragment}
        onStartLinkImport={onStartLinkImport}
      />

      <ImageDisclosureDialog
        errorMessage={imageDisclosureError}
        isOpen={imageDisclosure !== null}
        isPending={isImageDisclosurePending}
        key={imageDisclosureDialogKey}
        onAccept={() => void acceptImageProcessing()}
        onCancel={() => {
          if (!isImageDisclosurePending) {
            closeImageDisclosure();
          }
        }}
        onLocalOnly={() => void keepImageLocalOnly()}
      />

      <VoiceDisclosureDialog
        errorMessage={voiceDisclosureError}
        isOpen={voiceDisclosure !== null}
        isPending={isVoiceDisclosurePending}
        key={voiceDisclosureDialogKey}
        onAccept={() => void acceptVoiceProcessing()}
        onCancel={() => {
          if (!isVoiceDisclosurePending) {
            closeVoiceDisclosure();
          }
        }}
        onLocalOnly={() => void keepVoiceLocalOnly()}
      />
    </WorkspaceRoot>
  );
}
