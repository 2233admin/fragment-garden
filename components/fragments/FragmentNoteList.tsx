"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { FragmentNote } from "@/domain";
import { deleteFragmentNote } from "@/services/delete-fragment-note";
import { localPersistenceErrorMessage } from "@/services/local-persistence-error";
import { updateFragmentNote } from "@/services/update-fragment-note";

import { AsyncButton } from "../shared/AsyncButton";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import type { DialogAppearance } from "../shared/ModalDialog";
import { formatFragmentTimestamp } from "./fragment-presenters";
import { MarkdownContent } from "./MarkdownContent";
import { RichTextEditor } from "./RichTextEditor";

type FragmentNoteListProps = Readonly<{
  dialogAppearance?: DialogAppearance;
  isDisabled: boolean;
  notes: readonly FragmentNote[];
  onEditingChange?: (isEditing: boolean) => void;
  onFeedback: (message: string, kind: "status" | "error") => void;
  onPendingChange: (isPending: boolean) => void;
  presentation?: "continuation" | "section";
}>;

function sortNotes(notes: readonly FragmentNote[]): FragmentNote[] {
  return [...notes].sort((left, right) => {
    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    return createdAtComparison === 0 ? left.id.localeCompare(right.id) : createdAtComparison;
  });
}

export function FragmentNoteList({
  dialogAppearance = "default",
  isDisabled,
  notes,
  onEditingChange,
  onFeedback,
  onPendingChange,
  presentation = "section",
}: FragmentNoteListProps) {
  const orderedNotes = useMemo(() => sortNotes(notes), [notes]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const mutationLockRef = useRef(false);

  useEffect(() => {
    onEditingChange?.(editingNoteId !== null);
    return () => onEditingChange?.(false);
  }, [editingNoteId, onEditingChange]);

  function beginEdit(note: FragmentNote): void {
    if (isDisabled || isPending) {
      return;
    }

    setEditingNoteId(note.id);
    setDraftMarkdown(note.contentMarkdown);
    setErrorMessage(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (
      editingNoteId === null ||
      draftMarkdown.trim().length === 0 ||
      mutationLockRef.current ||
      isDisabled
    ) {
      if (draftMarkdown.trim().length === 0) {
        setErrorMessage("追加笔记不能为空，修改尚未保存。");
      }
      return;
    }

    mutationLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    onPendingChange(true);

    try {
      await updateFragmentNote({
        contentMarkdown: draftMarkdown,
        noteId: editingNoteId,
      });
      setEditingNoteId(null);
      setDraftMarkdown("");
      onFeedback("追加笔记已更新。", "status");
    } catch (error) {
      setErrorMessage(
        localPersistenceErrorMessage(error, "修改没有保存，你的输入仍在，可以重试。"),
      );
      onFeedback("追加笔记修改失败，没有产生部分更新。", "error");
    } finally {
      mutationLockRef.current = false;
      setIsPending(false);
      onPendingChange(false);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deletingNoteId === null || mutationLockRef.current || isDisabled) {
      return;
    }

    mutationLockRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    onPendingChange(true);

    try {
      await deleteFragmentNote({ noteId: deletingNoteId });
      if (editingNoteId === deletingNoteId) {
        setEditingNoteId(null);
        setDraftMarkdown("");
      }
      setDeletingNoteId(null);
      onFeedback("追加笔记已删除。", "status");
    } catch {
      setErrorMessage("删除没有完成，这条追加笔记仍然保留。请重试。");
    } finally {
      mutationLockRef.current = false;
      setIsPending(false);
      onPendingChange(false);
    }
  }

  if (presentation === "continuation" && orderedNotes.length === 0) {
    return null;
  }

  const isContinuation = presentation === "continuation";

  return (
    <section
      aria-label={isContinuation ? "后续补充" : undefined}
      aria-labelledby={isContinuation ? undefined : "fragment-notes-title"}
      className={`border-t border-garden-line ${isContinuation ? "pt-6" : "pt-8"}`}
    >
      {!isContinuation ? (
        <div className="flex items-baseline justify-between gap-4">
          <h3
            className="font-display text-xl font-semibold text-garden-ink"
            id="fragment-notes-title"
          >
            追加笔记
          </h3>
          {orderedNotes.length > 0 ? (
            <span className="text-xs text-garden-muted">{orderedNotes.length} 条</span>
          ) : null}
        </div>
      ) : null}

      {orderedNotes.length === 0 ? (
        <p className="mt-3 text-sm leading-7 text-garden-muted">
          还没有追加笔记。新的资料、判断或进展可以单独记在这里。
        </p>
      ) : (
        <ol className={isContinuation ? "space-y-6" : "mt-5 divide-y divide-garden-line"}>
          {orderedNotes.map((note, index) => (
            <li className={isContinuation ? undefined : "py-5 first:pt-0 last:pb-0"} key={note.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-garden-muted">
                  <time dateTime={note.createdAt}>{formatFragmentTimestamp(note.createdAt)}</time>
                  {note.updatedAt !== note.createdAt ? <span>已编辑</span> : null}
                </div>
                {editingNoteId !== note.id ? (
                  <div className="flex items-center gap-3">
                    <button
                      aria-label={`编辑第 ${index + 1} 条追加笔记`}
                      className="text-sm font-semibold text-garden-accent hover:text-garden-accent-strong disabled:opacity-50"
                      disabled={isDisabled || isPending}
                      onClick={() => beginEdit(note)}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      aria-label={`删除第 ${index + 1} 条追加笔记`}
                      className="text-sm font-semibold text-garden-danger hover:brightness-90 disabled:opacity-50"
                      disabled={isDisabled || isPending}
                      onClick={() => {
                        setDeletingNoteId(note.id);
                        setErrorMessage(null);
                      }}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </div>

              {editingNoteId === note.id ? (
                <form className="mt-4" onSubmit={(event) => void saveEdit(event)}>
                  <RichTextEditor
                    ariaLabel={`编辑第 ${index + 1} 条追加笔记`}
                    autoFocus
                    disabled={isDisabled || isPending}
                    initialMarkdown={note.contentMarkdown}
                    namespace={`fragment-note-${note.id}`}
                    onChange={setDraftMarkdown}
                  />
                  {errorMessage !== null ? (
                    <p
                      aria-live="assertive"
                      className="mt-3 text-sm leading-6 text-garden-danger"
                      role="alert"
                    >
                      {errorMessage}
                    </p>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-3">
                    <button
                      className="rounded-md border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft disabled:opacity-50"
                      disabled={isPending}
                      onClick={() => {
                        setEditingNoteId(null);
                        setDraftMarkdown("");
                        setErrorMessage(null);
                      }}
                      type="button"
                    >
                      取消
                    </button>
                    <AsyncButton
                      className="rounded-md bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                      disabled={isDisabled && !isPending}
                      isPending={isPending}
                      pendingLabel="正在保存…"
                      type="submit"
                    >
                      保存修改
                    </AsyncButton>
                  </div>
                </form>
              ) : (
                <MarkdownContent className="mt-3" content={note.contentMarkdown} />
              )}
            </li>
          ))}
        </ol>
      )}

      <ConfirmDialog
        appearance={dialogAppearance}
        confirmLabel="删除笔记"
        description="这条追加笔记会从当前内容中移除，主体笔记不会被修改。"
        errorMessage={errorMessage}
        isOpen={deletingNoteId !== null}
        isPending={isPending}
        onCancel={() => {
          if (!isPending) {
            setDeletingNoteId(null);
            setErrorMessage(null);
          }
        }}
        onConfirm={() => void confirmDelete()}
        pendingLabel="正在删除…"
        title="删除这条追加笔记？"
      />
    </section>
  );
}
