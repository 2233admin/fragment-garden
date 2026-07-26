"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { queryLocalSettings } from "@/data/queries/companion-query";
import type { FragmentDetailViewModel } from "@/data/queries/fragment-detail-query";
import { ContentProcessingJobRepository } from "@/data/repositories/content-processing-job-repository";
import { normalizeContentMarkdown, plainTextToMarkdown } from "@/domain";
import { acceptSproutDisclosure } from "@/services/accept-sprout-disclosure";
import { localPersistenceErrorMessage } from "@/services/local-persistence-error";
import {
  cancelSproutGenerationJob,
  confirmSproutGeneration,
  createSproutGenerationJob,
  findActiveSproutGenerationJob,
  parseSproutJobSnapshot,
} from "@/services/sprout-generation-jobs";
import { sproutGeneratedNoteSchema } from "@/validation/sprout-generate-api";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";
import { RichTextEditor } from "./RichTextEditor";
import { SproutGenerateDisclosureDialog } from "./SproutGenerateDisclosureDialog";

type SproutGenerationDialogProps = Readonly<{
  detail: FragmentDetailViewModel;
  onClose: () => void;
  onOpenCreatedFragment: (fragmentId: string) => Promise<boolean>;
  onStartProcessingJob: (jobId: string) => void;
}>;

type PreparationState = "checking" | "awaiting_disclosure" | "saving_disclosure" | "ready";

const SECONDARY_BUTTON_CLASS =
  "rounded-md border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50";
const PRIMARY_BUTTON_CLASS =
  "rounded-md bg-garden-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60";

function SproutPreviewEditor({
  initialMarkdown,
  initialTitle,
  isCancelling,
  isConfirming,
  jobId,
  onAbandon,
  onConfirm,
  sourceChanged,
}: Readonly<{
  initialMarkdown: string;
  initialTitle: string;
  isCancelling: boolean;
  isConfirming: boolean;
  jobId: string;
  onAbandon: () => void;
  onConfirm: (title: string, markdown: string) => void;
  sourceChanged: boolean;
}>) {
  const [title, setTitle] = useState(initialTitle);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const isPending = isCancelling || isConfirming;

  return (
    <section>
      <h3 className="font-display text-xl font-semibold text-garden-ink">新笔记预览</h3>
      {sourceChanged ? (
        <p className="mt-3 text-sm leading-6 text-garden-muted">
          这条新笔记基于你开始发芽时的内容生成。
        </p>
      ) : null}
      <label
        className="mt-5 block text-sm font-semibold text-garden-ink"
        htmlFor={`sprout-title-${jobId}`}
      >
        标题
      </label>
      <input
        className="mt-2 w-full rounded-md border border-garden-line bg-white px-4 py-3 text-base text-garden-ink outline-none focus:border-garden-accent disabled:opacity-60"
        disabled={isPending}
        id={`sprout-title-${jobId}`}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      <div className="mt-5">
        <RichTextEditor
          ariaLabel="新笔记正文"
          disabled={isPending}
          initialMarkdown={initialMarkdown}
          namespace={`sprout-preview-${jobId}`}
          onChange={setMarkdown}
          placeholder="整理这条新笔记…"
        />
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <AsyncButton
          className={SECONDARY_BUTTON_CLASS}
          isPending={isCancelling}
          onClick={onAbandon}
          pendingLabel="正在放弃…"
          type="button"
        >
          放弃
        </AsyncButton>
        <AsyncButton
          className={PRIMARY_BUTTON_CLASS}
          isPending={isConfirming}
          onClick={() => onConfirm(title, markdown)}
          pendingLabel="正在种下…"
          type="button"
        >
          确认种下
        </AsyncButton>
      </div>
    </section>
  );
}

function hasReadableSproutContent(detail: FragmentDetailViewModel): boolean {
  const body =
    detail.fragment.contentType === "audio"
      ? plainTextToMarkdown(
          detail.mediaAsset?.kind === "audio" ? (detail.mediaAsset.transcript ?? "") : "",
        )
      : detail.contentMarkdown;
  return (
    normalizeContentMarkdown(body).length > 0 ||
    detail.notes.some((note) => normalizeContentMarkdown(note.contentMarkdown).length > 0)
  );
}

export function SproutGenerationDialog({
  detail,
  onClose,
  onOpenCreatedFragment,
  onStartProcessingJob,
}: SproutGenerationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [preparation, setPreparation] = useState<PreparationState>("checking");
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isOpeningCreated, setIsOpeningCreated] = useState(false);
  const preparationLockRef = useRef(false);
  const isMountedRef = useRef(false);

  const job = useLiveQuery(
    () =>
      jobId === null
        ? Promise.resolve(undefined)
        : new ContentProcessingJobRepository().getById(jobId),
    [jobId],
    undefined,
  );

  async function createOrResumeJob(): Promise<void> {
    if (preparationLockRef.current) return;
    preparationLockRef.current = true;
    setErrorMessage(null);
    try {
      const result = await createSproutGenerationJob(detail.fragment.id);
      if (!isMountedRef.current) return;
      setJobId(result.job.id);
      setPreparation("ready");
      if (result.job.status === "pending" || result.job.status === "failed") {
        onStartProcessingJob(result.job.id);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setPreparation("ready");
        setErrorMessage(
          localPersistenceErrorMessage(
            error,
            "暂时没能开始发芽，没有创建新笔记，也没有修改原内容。",
          ),
        );
      }
    } finally {
      preparationLockRef.current = false;
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    let isActive = true;
    void (async () => {
      if (!hasReadableSproutContent(detail)) {
        if (isActive) setPreparation("ready");
        return;
      }
      try {
        const existing = await findActiveSproutGenerationJob(detail.fragment.id);
        if (!isActive) return;
        if (existing !== null) {
          setJobId(existing.id);
          setPreparation("ready");
          if (existing.status === "pending") onStartProcessingJob(existing.id);
          return;
        }
        const settings = await queryLocalSettings();
        if (!isActive) return;
        if (settings.sproutAiDisclosureAcceptedAt === null) {
          setPreparation("awaiting_disclosure");
          return;
        }
        await createOrResumeJob();
      } catch {
        if (isActive) {
          setPreparation("ready");
          setErrorMessage("暂时没能读取发芽状态，原笔记没有被修改。");
        }
      }
    })();
    return () => {
      isActive = false;
      isMountedRef.current = false;
    };
    // The generation snapshot is intentionally fixed when this dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.fragment.id]);

  async function acceptDisclosure(): Promise<void> {
    if (preparation !== "awaiting_disclosure" || preparationLockRef.current) return;
    setPreparation("saving_disclosure");
    setErrorMessage(null);
    try {
      await acceptSproutDisclosure({ now: new Date().toISOString() });
      if (!isMountedRef.current) return;
      setPreparation("ready");
      await createOrResumeJob();
    } catch (error) {
      if (isMountedRef.current) {
        setPreparation("awaiting_disclosure");
        setErrorMessage(
          localPersistenceErrorMessage(error, "这次没有保存你的选择，也没有发送笔记内容。请重试。"),
        );
      }
    }
  }

  async function abandon(): Promise<void> {
    if (jobId === null || isCancelling || isConfirming) return;
    setIsCancelling(true);
    setErrorMessage(null);
    try {
      await cancelSproutGenerationJob(jobId);
      onClose();
    } catch {
      setErrorMessage("这次没能结束发芽任务，没有创建新笔记。请稍后再试。");
    } finally {
      if (isMountedRef.current) setIsCancelling(false);
    }
  }

  async function confirm(previewTitle: string, previewMarkdown: string): Promise<void> {
    if (job?.status !== "awaiting_confirmation" || isConfirming) return;
    const preview = sproutGeneratedNoteSchema.safeParse({
      title: previewTitle.trim(),
      markdown: normalizeContentMarkdown(previewMarkdown),
    });
    if (!preview.success) {
      setErrorMessage("请保留一个标题和一段可阅读的正文，再确认种下。");
      return;
    }

    setIsConfirming(true);
    setErrorMessage(null);
    try {
      await confirmSproutGeneration({
        jobId: job.id,
        title: preview.data.title,
        markdown: preview.data.markdown,
      });
    } catch (error) {
      setErrorMessage(
        localPersistenceErrorMessage(error, "这次没有种下新笔记，也没有修改原笔记。请重试。"),
      );
    } finally {
      if (isMountedRef.current) setIsConfirming(false);
    }
  }

  async function openCreated(): Promise<void> {
    if (
      job?.createdFragmentId === null ||
      job?.createdFragmentId === undefined ||
      isOpeningCreated
    ) {
      return;
    }
    setIsOpeningCreated(true);
    setErrorMessage(null);
    try {
      const didOpen = await onOpenCreatedFragment(job.createdFragmentId);
      if (!didOpen && isMountedRef.current) {
        setErrorMessage("新笔记已经保存，但暂时没能打开，可以从卡片列表中找到。");
      }
    } catch {
      if (isMountedRef.current) {
        setErrorMessage("新笔记已经保存，但暂时没能打开，可以从卡片列表中找到。");
      }
    } finally {
      if (isMountedRef.current) setIsOpeningCreated(false);
    }
  }

  const isDisclosureOpen =
    preparation === "awaiting_disclosure" || preparation === "saving_disclosure";
  const sourceChanged = (() => {
    if (job === undefined) return false;
    try {
      return parseSproutJobSnapshot(job).sourceUpdatedAt !== detail.fragment.updatedAt;
    } catch {
      return false;
    }
  })();
  const isPending = isConfirming || isCancelling || isOpeningCreated;

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[92vh] w-[min(94vw,52rem)] overflow-y-auto rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
        describedBy={descriptionId}
        isOpen
        isPending={isPending}
        labelledBy={titleId}
        onRequestClose={onClose}
      >
        <header className="flex items-start justify-between gap-5 border-b border-garden-line px-6 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold text-garden-accent">思维发芽</p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
              生成一条新笔记
            </h2>
            <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
              基于当前笔记和你的追加内容生成预览。只有确认后才会种下新卡片和植物。
            </p>
          </div>
          <button
            className={SECONDARY_BUTTON_CLASS}
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </header>

        <div className="px-6 py-6 sm:px-8">
          {!hasReadableSproutContent(detail) ? (
            <section aria-live="polite">
              <h3 className="font-display text-xl font-semibold text-garden-ink">还需要一点内容</h3>
              <p className="mt-3 text-sm leading-7 text-garden-muted">
                这条笔记目前没有足够的可读文字。先补充正文或追加一条笔记，再回来发芽。
              </p>
            </section>
          ) : null}

          {preparation === "checking" ? (
            <section aria-busy="true" aria-live="polite" className="py-10 text-center">
              <p className="font-display text-xl font-semibold text-garden-ink">正在准备发芽…</p>
            </section>
          ) : null}

          {isDisclosureOpen ? (
            <section aria-live="polite" className="py-10 text-center">
              <p className="font-display text-xl font-semibold text-garden-ink">
                需要先确认数据说明
              </p>
            </section>
          ) : null}

          {job !== undefined && (job.status === "pending" || job.status === "processing") ? (
            <section aria-busy="true" aria-live="polite" className="py-10 text-center">
              <p className="font-display text-xl font-semibold text-garden-ink">正在发芽…</p>
              <p className="mt-3 text-sm leading-7 text-garden-muted">
                正在从这条笔记和追加内容中整理出一个新的想法。你可以先离开，原笔记不会改变。
              </p>
            </section>
          ) : null}

          {job?.status === "failed" ? (
            <section>
              <h3 className="font-display text-xl font-semibold text-garden-ink">
                这次没有发芽完成
              </h3>
              <p className="mt-3 text-sm leading-7 text-garden-muted">
                {job.errorMessage ?? "没有创建新笔记，也没有修改原内容。"}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <AsyncButton
                  className={SECONDARY_BUTTON_CLASS}
                  isPending={isCancelling}
                  onClick={() => void abandon()}
                  pendingLabel="正在结束…"
                  type="button"
                >
                  结束任务
                </AsyncButton>
                <button
                  className={PRIMARY_BUTTON_CLASS}
                  onClick={() => onStartProcessingJob(job.id)}
                  type="button"
                >
                  重试
                </button>
              </div>
            </section>
          ) : null}

          {job?.status === "awaiting_confirmation" &&
          job.resultTitle !== null &&
          job.resultMarkdown !== null ? (
            <SproutPreviewEditor
              initialMarkdown={job.resultMarkdown}
              initialTitle={job.resultTitle}
              isCancelling={isCancelling}
              isConfirming={isConfirming}
              jobId={job.id}
              key={job.id}
              onAbandon={() => void abandon()}
              onConfirm={(title, markdown) => void confirm(title, markdown)}
              sourceChanged={sourceChanged}
            />
          ) : null}

          {job?.status === "completed" && job.createdFragmentId !== null ? (
            <section aria-live="polite">
              <h3 className="font-display text-xl font-semibold text-garden-ink">
                新的笔记已经种下
              </h3>
              <p className="mt-3 text-sm leading-7 text-garden-muted">
                原笔记保持不变，新笔记已经作为一张普通文字卡片出现在花园中。
              </p>
              <div className="mt-6 flex justify-end">
                <AsyncButton
                  className={PRIMARY_BUTTON_CLASS}
                  isPending={isOpeningCreated}
                  onClick={() => void openCreated()}
                  pendingLabel="正在打开…"
                  type="button"
                >
                  查看新笔记
                </AsyncButton>
              </div>
            </section>
          ) : null}

          {preparation === "ready" && jobId === null && hasReadableSproutContent(detail) ? (
            <section>
              <h3 className="font-display text-xl font-semibold text-garden-ink">暂时没能开始</h3>
              <p className="mt-3 text-sm leading-7 text-garden-muted">
                原笔记没有被修改，也没有创建临时卡片。
              </p>
              <button
                className={`${PRIMARY_BUTTON_CLASS} mt-6`}
                onClick={() => void createOrResumeJob()}
                type="button"
              >
                重试
              </button>
            </section>
          ) : null}

          {errorMessage !== null ? (
            <p
              aria-live="assertive"
              className="mt-5 rounded-md bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
      </ModalDialog>

      <SproutGenerateDisclosureDialog
        errorMessage={errorMessage}
        isOpen={isDisclosureOpen}
        isPending={preparation === "saving_disclosure"}
        onAccept={() => void acceptDisclosure()}
        onCancel={onClose}
      />
    </>
  );
}
