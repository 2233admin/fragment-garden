"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { createLocalFragment } from "@/services/create-local-fragment";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

type CreateTextFragmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (title: string) => void;
};

export function CreateTextFragmentDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateTextFragmentDialogProps) {
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [rawText, setRawText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submissionLockRef = useRef(false);

  function resetAndClose(): void {
    if (submissionLockRef.current) {
      return;
    }

    setTitle("");
    setRawText("");
    setErrorMessage(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current) {
      return;
    }

    if (rawText.trim().length === 0) {
      setErrorMessage("内容还没有填写，碎片尚未保存。请填写内容后重试。");
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await createLocalFragment({
        rawText,
        title,
      });

      setTitle("");
      setRawText("");
      onCreated(result.fragment.title);
      onClose();
    } catch {
      setErrorMessage("保存失败，这条碎片尚未写入本地。你的输入仍在，可以直接重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
    }
  }

  return (
    <ModalDialog
      className="m-auto max-h-[90vh] w-[min(92vw,38rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={resetAndClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
            新的文字碎片
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-garden-ink" id={titleId}>
            种下文字碎片
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted">
            先在本地保存内容。标题留空时，会从第一行自动生成。
          </p>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          <div>
            <label
              className="mb-2 block text-sm font-semibold text-garden-ink"
              htmlFor="create-fragment-title"
            >
              标题（可选）
            </label>
            <input
              className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
              disabled={isPending}
              id="create-fragment-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="不填写也可以"
              type="text"
              value={title}
            />
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-semibold text-garden-ink"
              htmlFor="create-fragment-content"
            >
              内容
            </label>
            <textarea
              autoFocus
              className="min-h-44 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
              disabled={isPending}
              id="create-fragment-content"
              onChange={(event) => setRawText(event.target.value)}
              placeholder="记下现在不想处理、但也不想忘记的内容…"
              required
              value={rawText}
            />
          </div>

          {errorMessage !== null ? (
            <p
              aria-live="assertive"
              className="rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-garden-line px-6 py-4 sm:px-8">
          <button
            className="rounded-full border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={resetAndClose}
            type="button"
          >
            取消
          </button>
          <AsyncButton
            className="rounded-full bg-garden-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
            isPending={isPending}
            pendingLabel="正在种下…"
            type="submit"
          >
            种下
          </AsyncButton>
        </div>
      </form>
    </ModalDialog>
  );
}
