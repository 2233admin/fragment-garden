"use client";

import type { FormEvent } from "react";

import { AsyncButton } from "../shared/AsyncButton";

type CreateTextFragmentFormProps = {
  appearance?: "default" | "starmap";
  errorMessage: string | null;
  isPending: boolean;
  onCancel: () => void;
  onRawTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleChange: (value: string) => void;
  rawText: string;
  title: string;
};

export function CreateTextFragmentForm({
  appearance = "default",
  errorMessage,
  isPending,
  onCancel,
  onRawTextChange,
  onSubmit,
  onTitleChange,
  rawText,
  title,
}: CreateTextFragmentFormProps) {
  const isStarmapAppearance = appearance === "starmap";

  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-5 px-6 py-6 sm:px-8">
        {!isStarmapAppearance ? (
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
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="不填写也可以"
              type="text"
              value={title}
            />
          </div>
        ) : null}

        <div>
          <label
            className={
              isStarmapAppearance ? "sr-only" : "mb-2 block text-sm font-semibold text-garden-ink"
            }
            htmlFor="create-fragment-content"
          >
            内容
          </label>
          <div className="memory-record-field-glow">
            <textarea
              autoFocus
              className="min-h-44 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink placeholder:text-garden-muted/65 disabled:opacity-60"
              disabled={isPending}
              id="create-fragment-content"
              onChange={(event) => onRawTextChange(event.target.value)}
              placeholder="写下此刻…"
              required
              value={rawText}
            />
          </div>
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
          onClick={onCancel}
          type="button"
        >
          取消
        </button>
        <AsyncButton
          className="rounded-full bg-garden-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
          isPending={isPending}
          pendingLabel="正在保存…"
          type="submit"
        >
          保存记录
        </AsyncButton>
      </div>
    </form>
  );
}
