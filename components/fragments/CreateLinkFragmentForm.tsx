"use client";

import type { FormEvent } from "react";

import { AsyncButton } from "../shared/AsyncButton";

type CreateLinkFragmentFormProps = {
  errorMessage: string | null;
  isPending: boolean;
  onCancel: () => void;
  onSourceUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  sourceUrl: string;
  title: string;
};

export function CreateLinkFragmentForm({
  errorMessage,
  isPending,
  onCancel,
  onSourceUrlChange,
  onSubmit,
  onTitleChange,
  sourceUrl,
  title,
}: CreateLinkFragmentFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        <div>
          <label
            className="mb-2 block text-sm font-semibold text-garden-ink"
            htmlFor="create-link-url"
          >
            链接地址
          </label>
          <input
            autoFocus
            className="w-full rounded-xl border border-garden-line bg-white px-4 py-3 text-sm text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
            disabled={isPending}
            id="create-link-url"
            maxLength={2048}
            onChange={(event) => onSourceUrlChange(event.target.value)}
            placeholder="https://example.com/article"
            required
            type="url"
            value={sourceUrl}
          />
        </div>

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

        <p className="rounded-xl border border-garden-line bg-garden-canvas/55 px-4 py-3 text-xs leading-5 text-garden-muted">
          提交后会先保存原链接和植物，再在后台读取内容。读取失败不会删除已经种下的碎片。
        </p>

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
          pendingLabel="正在种下…"
          type="submit"
        >
          种下链接
        </AsyncButton>
      </div>
    </form>
  );
}
