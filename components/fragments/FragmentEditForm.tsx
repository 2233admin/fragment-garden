"use client";

import { useRef, useState, type FormEvent } from "react";

import type { FragmentContentType } from "@/domain";
import { updateFragmentContent } from "@/services/update-fragment-content";

import { AsyncButton } from "../shared/AsyncButton";
import { RichTextEditor } from "./RichTextEditor";

type FragmentEditFormProps = Readonly<{
  contentType: FragmentContentType;
  fragmentId: string;
  initialContentMarkdown: string;
  initialTitle: string;
  isDisabled: boolean;
  onCancel: () => void;
  onPendingChange: (isPending: boolean) => void;
  onSaved: (message: string) => void;
}>;

const IMMUTABLE_SOURCE_COPY: Partial<Record<FragmentContentType, string>> = {
  audio: "原始录音不会被修改。",
  image: "原始图片不会被修改。",
  link: "原链接不会被修改，也不会重新读取。",
};

export function FragmentEditForm({
  contentType,
  fragmentId,
  initialContentMarkdown,
  initialTitle,
  isDisabled,
  onCancel,
  onPendingChange,
  onSaved,
}: FragmentEditFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [contentMarkdown, setContentMarkdown] = useState(initialContentMarkdown);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submissionLockRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isDisabled) {
      return;
    }

    if (title.trim().length === 0) {
      setErrorMessage("标题不能为空，修改尚未保存。");
      return;
    }

    if (contentMarkdown.trim().length === 0) {
      setErrorMessage("主体内容不能为空，修改尚未保存。");
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    onPendingChange(true);

    try {
      await updateFragmentContent({
        contentMarkdown,
        editedFields: {
          contentMarkdown: true,
          title: true,
        },
        fragmentId,
        title,
      });
      onSaved("标题和主体内容已保存。");
    } catch {
      setErrorMessage("修改保存失败，原内容没有被替换。你的输入仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
      onPendingChange(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => void handleSubmit(event)}>
      <div>
        <p className="text-xs font-semibold text-garden-accent">编辑笔记</p>
        <h3 className="mt-1 font-display text-2xl font-semibold text-garden-ink">标题与主体内容</h3>
        {IMMUTABLE_SOURCE_COPY[contentType] !== undefined ? (
          <p className="mt-2 text-sm leading-6 text-garden-muted">
            {IMMUTABLE_SOURCE_COPY[contentType]}
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="mb-2 block text-sm font-semibold text-garden-ink"
          htmlFor={`edit-title-${fragmentId}`}
        >
          标题
        </label>
        <input
          autoFocus
          className="w-full rounded-lg border border-garden-line bg-white px-4 py-3 text-base text-garden-ink focus:border-garden-accent disabled:opacity-60"
          disabled={isDisabled}
          id={`edit-title-${fragmentId}`}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          type="text"
          value={title}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-garden-ink">主体内容</p>
        <RichTextEditor
          ariaLabel="编辑主体内容"
          disabled={isDisabled}
          initialMarkdown={initialContentMarkdown}
          namespace={`fragment-body-${fragmentId}`}
          onChange={setContentMarkdown}
        />
      </div>

      {errorMessage !== null ? (
        <p aria-live="assertive" className="text-sm leading-6 text-garden-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-garden-line pt-5">
        <button
          className="rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
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
          保存修改
        </AsyncButton>
      </div>
    </form>
  );
}
