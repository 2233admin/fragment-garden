"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { AsyncButton } from "../shared/AsyncButton";
import { ModalDialog } from "../shared/ModalDialog";

const OUTCOME_MAX_LENGTH = 300;

type CompleteFragmentDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (outcome: string | null) => Promise<void>;
};

export function CompleteFragmentDialog({
  isOpen,
  onClose,
  onComplete,
}: CompleteFragmentDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [outcome, setOutcome] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submissionLockRef = useRef(false);

  function resetAndClose(): void {
    if (submissionLockRef.current) {
      return;
    }

    setOutcome("");
    setErrorMessage(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);

    try {
      const normalizedOutcome = outcome.trim();
      await onComplete(normalizedOutcome.length === 0 ? null : normalizedOutcome);
      setOutcome("");
      onClose();
    } catch {
      setErrorMessage("暂时无法标记完成，没有产生部分更新。你的完成说明仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
    }
  }

  return (
    <ModalDialog
      className="m-auto w-[min(92vw,38rem)] rounded-2xl border border-garden-line bg-garden-paper p-0 shadow-2xl"
      describedBy={descriptionId}
      isOpen={isOpen}
      isPending={isPending}
      labelledBy={titleId}
      onRequestClose={resetAndClose}
    >
      <form aria-busy={isPending} onSubmit={handleSubmit}>
        <div className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-garden-accent uppercase">
            永久盛开
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-garden-ink" id={titleId}>
            标记为已完成
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
            完成后，这株植物会永久盛开。内容仍可查看、编辑和继续补充，但本阶段不提供撤销完成。
          </p>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <label
            className="mb-2 block text-sm font-semibold text-garden-ink"
            htmlFor="fragment-completion-outcome"
          >
            它最后变成了什么？（可选）
          </label>
          <textarea
            autoFocus
            className="min-h-32 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink disabled:opacity-60"
            disabled={isPending}
            id="fragment-completion-outcome"
            maxLength={OUTCOME_MAX_LENGTH}
            onChange={(event) => setOutcome(event.target.value)}
            placeholder="可以留空，也可以写下一句完成结果。"
            value={outcome}
          />
          <p className="mt-2 text-right text-xs text-garden-muted">
            {outcome.length}/{OUTCOME_MAX_LENGTH}
          </p>

          {errorMessage !== null ? (
            <p
              aria-live="assertive"
              className="mt-4 rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
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
            pendingLabel="正在完成…"
            type="submit"
          >
            确认完成
          </AsyncButton>
        </div>
      </form>
    </ModalDialog>
  );
}
