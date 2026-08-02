"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

type CreateChildFragmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: { rawText: string; title?: string }) => Promise<void>;
};

export function CreateChildFragmentDialog({
  isOpen,
  onClose,
  onCreate,
}: CreateChildFragmentDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fieldIdPrefix = useId();
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

    const normalizedRawText = rawText.trim();

    if (normalizedRawText.length === 0) {
      setErrorMessage("新想法的内容不能为空。请填写后再种下。");
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const normalizedTitle = title.trim();
      await onCreate({
        rawText: normalizedRawText,
        ...(normalizedTitle.length === 0 ? {} : { title: normalizedTitle }),
      });
      setTitle("");
      setRawText("");
      onClose();
    } catch {
      setErrorMessage("新想法暂时没有种下，没有产生部分更新。你的输入仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
    }
  }

  return (
    <ModalDialog
      className="m-auto max-h-[90vh] w-[min(92vw,40rem)] overflow-y-auto rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={resetAndClose}
    >
      <form aria-busy={isPending} onSubmit={handleSubmit}>
        <div className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
            独立的新植物
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
            让它长成一个新想法
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
            新想法会成为一株独立植物，并保留它从哪里生长而来。原碎片不会因此自动完成。
          </p>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          <div>
            <label
              className="mb-2 block text-sm font-semibold text-garden-ink"
              htmlFor={`${fieldIdPrefix}-title`}
            >
              新想法标题（可选）
            </label>
            <input
              className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink disabled:opacity-60"
              disabled={isPending}
              id={`${fieldIdPrefix}-title`}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="留空时会从内容第一行生成"
              type="text"
              value={title}
            />
          </div>

          <div>
            <label
              className="mb-2 block text-sm font-semibold text-garden-ink"
              htmlFor={`${fieldIdPrefix}-content`}
            >
              新想法内容
            </label>
            <textarea
              autoFocus
              className="min-h-44 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink disabled:opacity-60"
              disabled={isPending}
              id={`${fieldIdPrefix}-content`}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="写下这个新方向现在的样子…"
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
            种下新想法
          </AsyncButton>
        </div>
      </form>
    </ModalDialog>
  );
}
