"use client";

import { useState } from "react";

import type { ExternalLinkImport, Fragment, FragmentAnalysisStatus } from "@/domain";

type FragmentLinkDetailPanelProps = {
  externalLinkImport: ExternalLinkImport | null;
  fragment: Fragment;
  onRetryLinkImport?: (fragmentId: string) => Promise<void>;
};

const LINK_ANALYSIS_LABELS: Readonly<Record<FragmentAnalysisStatus, string>> = {
  not_required: "未读取",
  pending: "正在读取",
  completed: "已完成",
  failed: "读取失败",
};

const LINK_STATUS_DOT_CLASSES: Readonly<Record<FragmentAnalysisStatus, string>> = {
  not_required: "bg-garden-muted",
  pending: "bg-garden-accent",
  completed: "bg-garden-accent-strong",
  failed: "bg-garden-danger",
};

function deriveSourceHostname(sourceUrl: string | null): string {
  if (sourceUrl === null) {
    return "外部链接";
  }

  try {
    return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./u, "");
  } catch {
    return "外部链接";
  }
}

export function FragmentLinkDetailPanel({
  externalLinkImport,
  fragment,
  onRetryLinkImport,
}: FragmentLinkDetailPanelProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const sourceHostname = deriveSourceHostname(fragment.sourceUrl);
  const canRetry = fragment.analysisStatus === "failed" && onRetryLinkImport !== undefined;
  const extractedSourceContent =
    externalLinkImport?.sourceContent ??
    (externalLinkImport?.userProvidedContent === true ? null : fragment.rawText);

  async function retryLinkImport(): Promise<void> {
    if (!canRetry || isRetrying) {
      return;
    }

    setIsRetrying(true);
    setRetryError(null);

    try {
      await onRetryLinkImport(fragment.id);
    } catch {
      setRetryError("重新读取没有启动，原链接和本地内容都没有被删除。请稍后重试。");
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <section
      aria-labelledby={`link-detail-title-${fragment.id}`}
      className="rounded-2xl border border-garden-line bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-garden-accent uppercase">
            链接内容
          </p>
          <h3
            className="mt-1 font-display text-xl font-semibold text-garden-ink"
            id={`link-detail-title-${fragment.id}`}
          >
            来源与读取结果
          </h3>
        </div>
        {fragment.sourceUrl !== null ? (
          <a
            className="rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
            href={fragment.sourceUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            打开原链接
          </a>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-garden-line bg-garden-canvas/55 px-3.5 py-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-garden-accent/25 bg-garden-paper text-lg font-semibold text-garden-accent"
        >
          ↗
        </span>
        <dl className="grid min-w-0 flex-1 gap-2 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-garden-muted">来源域名</dt>
            <dd className="mt-0.5 truncate font-semibold text-garden-ink">{sourceHostname}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-garden-muted">读取状态</dt>
            <dd className="mt-0.5 inline-flex items-center gap-2 font-semibold text-garden-ink">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${LINK_STATUS_DOT_CLASSES[fragment.analysisStatus]}`}
              />
              {LINK_ANALYSIS_LABELS[fragment.analysisStatus]}
            </dd>
          </div>
        </dl>
      </div>

      {fragment.sourceUrl !== null ? (
        <p className="mt-3 break-all text-xs leading-5 text-garden-muted">{fragment.sourceUrl}</p>
      ) : null}

      {fragment.analysisStatus === "pending" ? (
        <p
          aria-live="polite"
          className="mt-4 rounded-xl border border-garden-accent/20 bg-garden-soft/55 px-4 py-3 text-sm leading-6 text-garden-ink"
          role="status"
        >
          链接已经种下，正在读取内容。你可以先关闭详情，读取会在后台继续。
        </p>
      ) : null}

      {fragment.analysisStatus === "failed" ? (
        <div
          className="mt-4 rounded-xl bg-garden-danger-soft/65 px-4 py-3 text-sm leading-6 text-garden-danger"
          role="alert"
        >
          <p className="font-semibold">链接已经种下，但暂时没能读取完整内容。</p>
          <p className="mt-1">
            {externalLinkImport?.errorMessage ??
              "原链接、标题和植物仍保存在本地，你可以重新读取或手动编辑。"}
          </p>
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        <section>
          <h4 className="text-sm font-semibold text-garden-ink">摘要</h4>
          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-garden-line bg-garden-paper px-4 py-3 text-sm leading-6 text-garden-ink">
            {fragment.summary ?? "还没有可显示的摘要。"}
          </p>
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold text-garden-ink">已提取正文</h4>
            {externalLinkImport?.sourceContentTruncated === true ? (
              <span className="rounded-full bg-garden-soft px-2.5 py-1 text-xs font-semibold text-garden-accent-strong">
                内容较长，已截断
              </span>
            ) : (
              <span className="text-xs text-garden-muted">未截断</span>
            )}
          </div>
          <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-garden-line bg-garden-paper px-4 py-3 text-sm leading-7 text-garden-ink">
            {extractedSourceContent ?? "还没有提取到正文。"}
          </p>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-garden-line pt-4">
        <a
          className="rounded-full border border-garden-line px-4 py-2 text-sm font-semibold text-garden-ink hover:bg-garden-soft"
          href={`#edit-fragment-${fragment.id}`}
        >
          手动编辑
        </a>
        {canRetry ? (
          <button
            aria-busy={isRetrying}
            className="rounded-full bg-garden-accent px-4 py-2 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:cursor-wait disabled:opacity-60"
            disabled={isRetrying}
            onClick={() => void retryLinkImport()}
            type="button"
          >
            {isRetrying ? "正在重新读取…" : "重新读取"}
          </button>
        ) : null}
      </div>

      {retryError !== null ? (
        <p
          aria-live="assertive"
          className="mt-3 text-sm font-semibold leading-6 text-garden-danger"
          role="alert"
        >
          {retryError}
        </p>
      ) : null}
    </section>
  );
}
