"use client";

import { useEffect } from "react";
import { TOGGLE_LINK_COMMAND, LinkNode } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  HEADING,
  LINK,
  ORDERED_LIST,
  QUOTE,
  type TextMatchTransformer,
  type Transformer,
  UNORDERED_LIST,
} from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
} from "lexical";

type RichTextEditorProps = Readonly<{
  ariaLabel: string;
  autoFocus?: boolean;
  disabled?: boolean;
  initialMarkdown: string;
  namespace: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}>;

function normalizeLinkUrl(value: string): string | null {
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 2_048) {
    return null;
  }

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

const SAFE_LINK: TextMatchTransformer = {
  ...LINK,
  replace: (textNode, match) => {
    const rawUrl = match[2];
    if (rawUrl === undefined || normalizeLinkUrl(rawUrl) === null) {
      return;
    }
    return LINK.replace?.(textNode, match);
  },
};

export const MVP_MARKDOWN_TRANSFORMERS: Transformer[] = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  SAFE_LINK,
];

function EditableStatePlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
}

function AutoFocusOncePlugin({ shouldFocus }: { shouldFocus: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (shouldFocus) {
      editor.focus();
    }
  }, [editor, shouldFocus]);

  return null;
}

function ToolbarButton({
  children,
  disabled,
  label,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="flex h-9 min-w-9 items-center justify-center rounded-md border border-transparent px-2 text-sm font-semibold text-garden-ink hover:border-garden-line hover:bg-white disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function EditorToolbar({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  function setBlock(type: "paragraph" | "heading" | "quote"): void {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return;
      }

      if (type === "heading") {
        $setBlocksType(selection, () => $createHeadingNode("h2"));
      } else if (type === "quote") {
        $setBlocksType(selection, () => $createQuoteNode());
      } else {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  }

  function addLink(): void {
    const input = window.prompt("输入链接地址（http、https 或 mailto）");
    if (input === null) {
      return;
    }

    const url = normalizeLinkUrl(input);
    if (url === null) {
      window.alert("链接地址无效，请使用 http、https 或 mailto 地址。");
      return;
    }

    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  }

  return (
    <div
      aria-label="文字格式"
      className="flex min-h-12 flex-wrap items-center gap-1 border-b border-garden-line bg-garden-canvas/45 px-2 py-1.5"
      role="toolbar"
    >
      <ToolbarButton disabled={disabled} label="正文" onClick={() => setBlock("paragraph")}>
        正文
      </ToolbarButton>
      <ToolbarButton disabled={disabled} label="标题" onClick={() => setBlock("heading")}>
        标题
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label="加粗"
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label="无序列表"
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
      >
        列表
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        label="有序列表"
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}
      >
        编号
      </ToolbarButton>
      <ToolbarButton disabled={disabled} label="引用" onClick={() => setBlock("quote")}>
        引用
      </ToolbarButton>
      <ToolbarButton disabled={disabled} label="添加链接" onClick={addLink}>
        链接
      </ToolbarButton>
    </div>
  );
}

export function RichTextEditor({
  ariaLabel,
  autoFocus = false,
  disabled = false,
  initialMarkdown,
  namespace,
  onChange,
  placeholder = "写下内容…",
}: RichTextEditorProps) {
  return (
    <LexicalComposer
      initialConfig={{
        editable: !disabled,
        editorState: () => $convertFromMarkdownString(initialMarkdown, MVP_MARKDOWN_TRANSFORMERS),
        namespace,
        nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
        onError(error: Error) {
          throw error;
        },
        theme: {
          heading: {
            h1: "mt-5 mb-2 font-display text-2xl font-semibold text-garden-ink first:mt-0",
            h2: "mt-5 mb-2 font-display text-xl font-semibold text-garden-ink first:mt-0",
            h3: "mt-4 mb-2 text-base font-semibold text-garden-ink first:mt-0",
          },
          link: "font-semibold text-garden-accent underline underline-offset-4",
          list: {
            listitem: "my-1 ml-6",
            nested: { listitem: "ml-5" },
            ol: "my-3 list-decimal",
            ul: "my-3 list-disc",
          },
          paragraph: "my-2 first:mt-0 last:mb-0",
          quote:
            "my-4 border-l-4 border-garden-accent/45 bg-garden-soft/35 py-2 pr-4 pl-4 text-garden-muted",
          text: { bold: "font-semibold" },
        },
      }}
    >
      <div className="overflow-hidden rounded-lg border border-garden-line bg-white focus-within:border-garden-accent">
        <EditorToolbar disabled={disabled} />
        <div className="relative">
          <RichTextPlugin
            ErrorBoundary={LexicalErrorBoundary}
            contentEditable={
              <ContentEditable
                aria-label={ariaLabel}
                className="min-h-44 resize-y overflow-auto px-4 py-3 text-sm leading-7 text-garden-ink outline-none disabled:opacity-60"
              />
            }
            placeholder={
              <div className="pointer-events-none absolute top-3 left-4 text-sm leading-7 text-garden-muted">
                {placeholder}
              </div>
            }
          />
          <HistoryPlugin />
          <LinkPlugin />
          <ListPlugin />
          <MarkdownShortcutPlugin transformers={MVP_MARKDOWN_TRANSFORMERS} />
          <OnChangePlugin
            ignoreSelectionChange
            onChange={(editorState: EditorState) => {
              editorState.read(() => onChange($convertToMarkdownString(MVP_MARKDOWN_TRANSFORMERS)));
            }}
          />
          <EditableStatePlugin disabled={disabled} />
          <AutoFocusOncePlugin shouldFocus={autoFocus} />
        </div>
      </div>
    </LexicalComposer>
  );
}
