"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { queryLocalSettings } from "@/data/queries/companion-query";
import { acceptGetNoteDisclosure } from "@/services/accept-getnote-disclosure";
import { createLocalFragment } from "@/services/create-local-fragment";
import { createLocalLinkFragment } from "@/services/create-local-link-fragment";

import { DuplicateLinkDialog } from "../link-imports/DuplicateLinkDialog";
import { GetNoteDisclosureDialog } from "../link-imports/GetNoteDisclosureDialog";
import { ModalDialog } from "../shared/ModalDialog";
import { CreateLinkFragmentForm } from "./CreateLinkFragmentForm";
import { CreateTextFragmentForm } from "./CreateTextFragmentForm";

export type CreatedFragmentNotice =
  | Readonly<{
      contentType: "text";
      title: string;
    }>
  | Readonly<{
      contentType: "link";
      linkImportStarted: boolean;
      title: string;
    }>;

type CreateFragmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (result: CreatedFragmentNotice) => void;
  onOpenExistingFragment: (fragmentId: string, triggerElement: HTMLButtonElement) => void;
  onStartLinkImport?: (fragmentId: string) => void;
};

type CreateMode = "text" | "link";
type PendingAction =
  | "checking_disclosure"
  | "accepting_disclosure"
  | "saving_text"
  | "saving_link"
  | "saving_duplicate"
  | null;

type DuplicateCandidate = Readonly<{
  fragmentId: string;
  title: string;
}>;

export function CreateFragmentDialog({
  isOpen,
  onClose,
  onCreated,
  onOpenExistingFragment,
  onStartLinkImport,
}: CreateFragmentDialogProps) {
  const titleId = useId();
  const submissionLockRef = useRef(false);
  const [mode, setMode] = useState<CreateMode>("text");
  const [textTitle, setTextTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isDisclosureOpen, setIsDisclosureOpen] = useState(false);
  const [disclosureError, setDisclosureError] = useState<string | null>(null);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DuplicateCandidate | null>(null);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const isPending = pendingAction !== null;

  function clearState(): void {
    setMode("text");
    setTextTitle("");
    setRawText("");
    setLinkTitle("");
    setSourceUrl("");
    setPendingAction(null);
    setFormError(null);
    setSelectionError(null);
    setIsDisclosureOpen(false);
    setDisclosureError(null);
    setDuplicateCandidate(null);
    setDuplicateError(null);
  }

  function resetAndClose(): void {
    if (submissionLockRef.current || isPending) {
      return;
    }

    clearState();
    onClose();
  }

  function selectTextMode(): void {
    if (isPending) {
      return;
    }

    setMode("text");
    setFormError(null);
    setSelectionError(null);
  }

  async function selectLinkMode(): Promise<void> {
    if (isPending || mode === "link") {
      return;
    }

    setPendingAction("checking_disclosure");
    setSelectionError(null);

    try {
      const settings = await queryLocalSettings();

      if (settings.getNoteDisclosureAcceptedAt === null) {
        setDisclosureError(null);
        setIsDisclosureOpen(true);
      } else {
        setMode("link");
        setFormError(null);
      }
    } catch {
      setSelectionError("暂时无法读取第三方处理设置，因此没有开始链接导入。请重新选择链接。");
    } finally {
      setPendingAction(null);
    }
  }

  async function acceptDisclosure(): Promise<void> {
    if (pendingAction !== null) {
      return;
    }

    setPendingAction("accepting_disclosure");
    setDisclosureError(null);

    try {
      await acceptGetNoteDisclosure({ now: new Date().toISOString() });
      setIsDisclosureOpen(false);
      setMode("link");
      setFormError(null);
    } catch {
      setDisclosureError("同意状态没有保存，因此尚未创建链接碎片，也没有调用得到大脑。请重试。");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isPending) {
      return;
    }

    if (rawText.trim().length === 0) {
      setFormError("内容还没有填写，碎片尚未保存。请填写内容后重试。");
      return;
    }

    submissionLockRef.current = true;
    setPendingAction("saving_text");
    setFormError(null);

    try {
      const result = await createLocalFragment({ rawText, title: textTitle });
      const notice: CreatedFragmentNotice = {
        contentType: "text",
        title: result.fragment.title,
      };

      clearState();
      onCreated(notice);
      onClose();
    } catch {
      setFormError("保存失败，这条碎片尚未写入本地。你的输入仍在，可以直接重试。");
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  async function saveLink(allowDuplicate: boolean): Promise<void> {
    if (submissionLockRef.current || isPending) {
      return;
    }

    submissionLockRef.current = true;
    setPendingAction(allowDuplicate ? "saving_duplicate" : "saving_link");
    setFormError(null);
    setDuplicateError(null);

    try {
      let result: Awaited<ReturnType<typeof createLocalLinkFragment>>;

      try {
        result = await createLocalLinkFragment({
          sourceUrl,
          title: linkTitle,
          initiatedBy: "form",
          now: new Date().toISOString(),
          allowDuplicate,
        });
      } catch {
        const message =
          "链接尚未保存到本地。请确认地址使用 HTTP/HTTPS，且不是本地或内网地址，然后重试。";

        if (allowDuplicate) {
          setDuplicateError(message);
        } else {
          setFormError(message);
        }
        return;
      }

      if (result.kind === "duplicate") {
        setDuplicateCandidate({
          fragmentId: result.fragment.id,
          title: result.fragment.title,
        });
        return;
      }

      const fragmentId = result.fragment.id;
      let linkImportStarted = false;

      try {
        onStartLinkImport?.(fragmentId);
        linkImportStarted = onStartLinkImport !== undefined;
      } catch {
        // The local import record remains resumable after a refresh.
      }

      const notice: CreatedFragmentNotice = {
        contentType: "link",
        linkImportStarted,
        title: result.fragment.title,
      };

      clearState();
      onCreated(notice);
      onClose();
    } finally {
      submissionLockRef.current = false;
      setPendingAction(null);
    }
  }

  function openExistingFragment(triggerElement: HTMLButtonElement): void {
    const existingFragmentId = duplicateCandidate?.fragmentId;

    if (existingFragmentId === undefined || isPending) {
      return;
    }

    clearState();
    onClose();
    requestAnimationFrame(() => {
      onOpenExistingFragment(existingFragmentId, triggerElement);
    });
  }

  const isTextMode = mode === "text";

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[90vh] w-[min(92vw,38rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
        isOpen={isOpen}
        isPending={isPending}
        labelledBy={titleId}
        onRequestClose={resetAndClose}
      >
        <header className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
            新的{isTextMode ? "文字" : "链接"}碎片
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-garden-ink" id={titleId}>
            种下{isTextMode ? "文字" : "链接"}碎片
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted">
            {isTextMode
              ? "先在本地保存内容。标题留空时，会从第一行自动生成。"
              : "原链接和植物会先在本地保存，不需要等待第三方读取完成。"}
          </p>

          <div
            aria-label="碎片类型"
            className="mt-4 inline-flex rounded-full border border-garden-line bg-garden-canvas/55 p-1"
            role="group"
          >
            <button
              aria-pressed={isTextMode}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                isTextMode
                  ? "bg-garden-paper text-garden-accent shadow-sm"
                  : "text-garden-muted hover:text-garden-ink"
              }`}
              disabled={isPending}
              onClick={selectTextMode}
              type="button"
            >
              文字
            </button>
            <button
              aria-busy={pendingAction === "checking_disclosure"}
              aria-pressed={!isTextMode}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                !isTextMode
                  ? "bg-garden-paper text-garden-accent shadow-sm"
                  : "text-garden-muted hover:text-garden-ink"
              }`}
              disabled={isPending}
              onClick={() => void selectLinkMode()}
              type="button"
            >
              {pendingAction === "checking_disclosure" ? "正在准备…" : "链接"}
            </button>
          </div>

          {selectionError !== null ? (
            <p
              aria-live="assertive"
              className="mt-3 text-sm font-semibold leading-6 text-garden-danger"
              role="alert"
            >
              {selectionError}
            </p>
          ) : null}
        </header>

        {isTextMode ? (
          <CreateTextFragmentForm
            errorMessage={formError}
            isPending={isPending}
            onCancel={resetAndClose}
            onRawTextChange={setRawText}
            onSubmit={(event) => void handleTextSubmit(event)}
            onTitleChange={setTextTitle}
            rawText={rawText}
            title={textTitle}
          />
        ) : (
          <CreateLinkFragmentForm
            errorMessage={formError}
            isPending={isPending}
            onCancel={resetAndClose}
            onSourceUrlChange={setSourceUrl}
            onSubmit={(event) => {
              event.preventDefault();
              void saveLink(false);
            }}
            onTitleChange={setLinkTitle}
            sourceUrl={sourceUrl}
            title={linkTitle}
          />
        )}
      </ModalDialog>

      <GetNoteDisclosureDialog
        errorMessage={disclosureError}
        isOpen={isDisclosureOpen}
        isPending={pendingAction === "accepting_disclosure"}
        onAccept={() => void acceptDisclosure()}
        onCancel={() => {
          if (pendingAction === null) {
            setDisclosureError(null);
            setIsDisclosureOpen(false);
          }
        }}
      />

      <DuplicateLinkDialog
        errorMessage={duplicateError}
        existingTitle={duplicateCandidate?.title ?? ""}
        isOpen={duplicateCandidate !== null}
        isPending={pendingAction === "saving_duplicate"}
        onCancel={() => {
          if (pendingAction === null) {
            setDuplicateCandidate(null);
            setDuplicateError(null);
          }
        }}
        onCreateDuplicate={() => void saveLink(true)}
        onOpenExisting={openExistingFragment}
      />
    </>
  );
}
