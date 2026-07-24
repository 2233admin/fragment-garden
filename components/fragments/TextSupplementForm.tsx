"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";

import { addTextSupplement } from "@/services/add-text-supplement";

import { AsyncButton } from "../shared/AsyncButton";

type TextSupplementFormProps = {
  fragmentId: string;
  intent?: "next_step" | "supplement";
  isDisabled: boolean;
  onPendingChange: (isPending: boolean) => void;
  onSaved: (message: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

export function TextSupplementForm({
  fragmentId,
  intent = "supplement",
  isDisabled,
  onPendingChange,
  onSaved,
  textareaRef,
}: TextSupplementFormProps) {
  const [text, setText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const submissionLockRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (submissionLockRef.current || isDisabled) {
      return;
    }

    if (text.trim().length === 0) {
      setErrorMessage("补充内容不能为空，这次补充尚未保存。请填写后重试。");
      return;
    }

    submissionLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    onPendingChange(true);

    try {
      await addTextSupplement({ fragmentId, text });
      setText("");
      onSaved("新补充已保存，植物成长状态已更新。");
    } catch {
      setErrorMessage("补充保存失败，没有产生部分更新。你的输入仍在，可以重试。");
    } finally {
      submissionLockRef.current = false;
      setIsPending(false);
      onPendingChange(false);
    }
  }

  return (
    <form
      className="rounded-2xl border border-garden-line bg-garden-soft/45 p-5"
      onSubmit={handleSubmit}
    >
      <h3 className="font-display text-xl font-semibold text-garden-ink">
        {intent === "next_step" ? "写下下一步" : "添加新补充"}
      </h3>
      <p className="mt-1 text-xs leading-5 text-garden-muted">
        {intent === "next_step"
          ? "下一步会作为一条文字补充保存，不会创建任务或自动执行。"
          : "补充会保留为独立历史，并按领域规则重新计算成长。"}
      </p>

      <label
        className="mt-5 mb-2 block text-sm font-semibold text-garden-ink"
        htmlFor={`supplement-${fragmentId}`}
      >
        {intent === "next_step" ? "写下下一步" : "添加新补充"}
      </label>
      <textarea
        className="min-h-28 w-full resize-y rounded-xl border border-garden-line bg-white px-4 py-3 text-sm leading-6 text-garden-ink disabled:opacity-60"
        disabled={isDisabled}
        id={`supplement-${fragmentId}`}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          intent === "next_step" ? "写下你愿意尝试的下一小步…" : "写下新的资料、判断或进展…"
        }
        ref={textareaRef}
        value={text}
      />

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
          保存补充
        </AsyncButton>
      </div>
    </form>
  );
}
