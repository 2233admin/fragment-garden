"use client";

import type { FormEvent } from "react";

import { EXTERNAL_URL_SOURCE_TEXT_MAX_LENGTH } from "@/domain";

import { AsyncButton } from "../shared/AsyncButton";

type CreateLinkFragmentFormProps = {
  appearance?: "default" | "starmap";
  errorMessage: string | null;
  isPending: boolean;
  note: string;
  onCancel: () => void;
  onNoteChange: (value: string) => void;
  onSourceUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  sourceUrl: string;
  title: string;
};

export function CreateLinkFragmentForm({
  appearance = "default",
  errorMessage,
  isPending,
  note,
  onCancel,
  onNoteChange,
  onSourceUrlChange,
  onSubmit,
  onTitleChange,
  sourceUrl,
  title,
}: CreateLinkFragmentFormProps) {
  const isStarmapAppearance = appearance === "starmap";

  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        <div>
          <label
            className="mb-2 block text-sm font-semibold text-garden-ink"
            htmlFor="create-link-url"
          >
            链接或分享内容
          </label>
          <div className="memory-record-field-glow">
            <input
              autoFocus
              className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
              disabled={isPending}
              id="create-link-url"
              inputMode="url"
              maxLength={EXTERNAL_URL_SOURCE_TEXT_MAX_LENGTH}
              onChange={(event) => onSourceUrlChange(event.target.value)}
              placeholder="粘贴链接，或带文案的分享内容"
              required
              type="text"
              value={sourceUrl}
            />
          </div>
        </div>

        {isStarmapAppearance ? (
          <div>
            <label
              className="mb-2 block text-sm font-semibold text-garden-ink"
              htmlFor="create-link-note"
            >
              补充内容（可选）
            </label>
            <div className="memory-record-field-glow">
              <textarea
                className="min-h-24 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
                disabled={isPending}
                id="create-link-note"
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="为什么想留下它？"
                value={note}
              />
            </div>
          </div>
        ) : (
          <div>
            <label
              className="mb-2 block text-sm font-semibold text-garden-ink"
              htmlFor="create-link-title"
            >
              标题（可选）
            </label>
            <input
              className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
              disabled={isPending}
              id="create-link-title"
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="不填写时先用来源域名生成"
              type="text"
              value={title}
            />
          </div>
        )}

        {!isStarmapAppearance ? (
          <p className="rounded-xl border border-garden-line bg-garden-canvas/55 px-4 py-3 text-xs leading-5 text-garden-muted">
            提交后会先整理链接内容。整理成功才会创建正式笔记和记忆星；失败时不会留下空记录。
          </p>
        ) : null}

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
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <AsyncButton
          className="rounded-full bg-garden-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
          isPending={isPending}
          pendingLabel="正在准备…"
          type="submit"
        >
          开始整理
        </AsyncButton>
      </div>
    </form>
  );
}
