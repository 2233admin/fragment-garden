"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import type { FragmentContentType } from "@/domain";
import { updateFragmentContent } from "@/services/update-fragment-content";

import { AsyncButton } from "../shared/AsyncButton";

type FragmentEditFormProps = {
  contentType: FragmentContentType;
  fragmentId: string;
  initialRawText: string;
  initialTitle: string;
  isDisabled: boolean;
  onPendingChange: (isPending: boolean) => void;
  onSaved: (message: string) => void;
};

export function FragmentEditForm({
  contentType,
  fragmentId,
  initialRawText,
  initialTitle,
  isDisabled,
  onPendingChange,
  onSaved,
}: FragmentEditFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [rawText, setRawText] = useState(initialRawText);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submissionLockRef = useRef(false);
  const previousFragmentIdRef = useRef(fragmentId);
  const isTitleDirtyRef = useRef(false);
  const isRawTextDirtyRef = useRef(false);

  useEffect(() => {
    const didFragmentChange = previousFragmentIdRef.current !== fragmentId;

    if (didFragmentChange) {
      previousFragmentIdRef.current = fragmentId;
      isTitleDirtyRef.current = false;
      isRawTextDirtyRef.current = false;
    }

    if (!isTitleDirtyRef.current) {
      setTitle(initialTitle);
    }
    if (!isRawTextDirtyRef.current) {
      setRawText(initialRawText);
    }
  }, [fragmentId, initialRawText, initialTitle]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isDisabled) {
      return;
    }

    if (contentType !== "link" && rawText.trim().length === 0) {
      setErrorMessage("原始内容不能为空，修改尚未保存。请填写内容后重试。");
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    onPendingChange(true);

    try {
      const editedFields = {
        title: isTitleDirtyRef.current,
        rawText: isRawTextDirtyRef.current,
      };
      const result = await updateFragmentContent({
        fragmentId,
        rawText,
        title,
        editedFields,
      });

      isTitleDirtyRef.current = false;
      isRawTextDirtyRef.current = false;
      setTitle(result.fragment.title);
      setRawText(result.fragment.rawText ?? "");
      onSaved(
        contentType === "link"
          ? "链接标题和正文已保存，不会自动重新读取。"
          : "标题和原始内容已保存。",
      );
    } catch {
      setErrorMessage("修改保存失败，本地原文没有被替换。你的输入仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
      onPendingChange(false);
    }
  }

  return (
    <form
      className="rounded-2xl border border-garden-line bg-white p-5"
      id={`edit-fragment-${fragmentId}`}
      onSubmit={handleSubmit}
    >
      <h3 className="font-display text-xl font-semibold text-garden-ink">编辑原始内容</h3>
      <p className="mt-1 text-xs leading-5 text-garden-muted">
        {contentType === "link"
          ? "手动编辑会保留为你的内容，不会自动重新读取链接，也不会增加成长分。"
          : "编辑不会增加成长分，也不会成为一条补充记录。"}
      </p>

      <div className="mt-5">
        <label
          className="mb-2 block text-sm font-semibold text-garden-ink"
          htmlFor={`edit-title-${fragmentId}`}
        >
          编辑标题
        </label>
        <input
          className="w-full rounded-xl border border-garden-line bg-garden-paper px-4 py-3 text-sm text-garden-ink disabled:opacity-60"
          disabled={isDisabled}
          id={`edit-title-${fragmentId}`}
          onChange={(event) => {
            isTitleDirtyRef.current = true;
            setTitle(event.target.value);
          }}
          type="text"
          value={title}
        />
      </div>

      <div className="mt-4">
        <label
          className="mb-2 block text-sm font-semibold text-garden-ink"
          htmlFor={`edit-content-${fragmentId}`}
        >
          {contentType === "link" ? "编辑提取正文（可选）" : "编辑原始内容"}
        </label>
        <textarea
          className="min-h-40 w-full resize-y rounded-xl border border-garden-line bg-garden-paper px-4 py-3 text-sm leading-6 text-garden-ink disabled:opacity-60"
          disabled={isDisabled}
          id={`edit-content-${fragmentId}`}
          onChange={(event) => {
            isRawTextDirtyRef.current = true;
            setRawText(event.target.value);
          }}
          required={contentType !== "link"}
          value={rawText}
        />
      </div>

      {errorMessage !== null ? (
        <p
          aria-live="assertive"
          className="mt-4 rounded-xl bg-garden-danger-soft px-4 py-3 text-sm leading-6 text-garden-danger"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end">
        <AsyncButton
          className="rounded-full bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
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
