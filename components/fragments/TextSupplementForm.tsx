"use client";

import { useRef, useState, type FormEvent } from "react";

import { addTextSupplement } from "@/services/add-text-supplement";

import { AsyncButton } from "../shared/AsyncButton";
import { RichTextEditor } from "./RichTextEditor";

type TextSupplementFormProps = Readonly<{
  fragmentId: string;
  isDisabled: boolean;
  onCancel: () => void;
  onPendingChange: (isPending: boolean) => void;
  onSaved: (message: string) => void;
}>;

export function TextSupplementForm({
  fragmentId,
  isDisabled,
  onCancel,
  onPendingChange,
  onSaved,
}: TextSupplementFormProps) {
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submissionLockRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isDisabled) {
      return;
    }

    if (contentMarkdown.trim().length === 0) {
      setErrorMessage("追加笔记不能为空，这次内容尚未保存。");
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    onPendingChange(true);

    try {
      await addTextSupplement({ fragmentId, contentMarkdown });
      setContentMarkdown("");
      onSaved("追加笔记已保存。");
    } catch {
      setErrorMessage("保存失败，没有产生部分更新。你的输入仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
      onPendingChange(false);
    }
  }

  return (
    <form
      className="border-t border-garden-line pt-7"
      id={`append-note-form-${fragmentId}`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h3 className="font-display text-xl font-semibold text-garden-ink">追加一条笔记</h3>
      <p className="mt-1 text-sm leading-6 text-garden-muted">
        新内容会独立保留，不会合并或覆盖上面的主体笔记。
      </p>

      <div className="mt-4">
        <RichTextEditor
          ariaLabel="追加笔记内容"
          autoFocus
          disabled={isDisabled}
          initialMarkdown=""
          namespace={`new-fragment-note-${fragmentId}`}
          onChange={setContentMarkdown}
          placeholder="写下新的资料、判断或进展…"
        />
      </div>

      {errorMessage !== null ? (
        <p aria-live="assertive" className="mt-4 text-sm leading-6 text-garden-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-3">
        <button
          className="rounded-md border border-garden-line px-4 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
          disabled={isPending}
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <AsyncButton
          className="rounded-md bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
          disabled={isDisabled && !isPending}
          isPending={isPending}
          pendingLabel="正在保存…"
          type="submit"
        >
          保存笔记
        </AsyncButton>
      </div>
    </form>
  );
}
