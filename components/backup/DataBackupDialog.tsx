"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";

import {
  createGardenBackup,
  gardenBackupErrorMessage,
  preflightGardenBackup,
  restoreGardenBackup,
  type GardenBackupPreflight,
} from "../../services/garden-backup";
import { RESTORE_COMPLETED_SESSION_KEY } from "../../services/garden-restore-coordination";

import { AsyncButton } from "../shared/AsyncButton";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { ModalDialog } from "../shared/ModalDialog";

type DataBackupDialogProps = Readonly<{
  isOpen: boolean;
  onClose: () => void;
  onRestoreCompleted: () => void;
}>;

type ImportState = Readonly<{
  file: File;
  preflight: GardenBackupPreflight;
}>;

function formatBackupTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function downloadBackup(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = objectUrl;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function DataBackupDialog({ isOpen, onClose, onRestoreCompleted }: DataBackupDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isPending = isExporting || isReading || isRestoring;

  async function exportBackup(): Promise<void> {
    if (isPending) return;
    setIsExporting(true);
    setErrorMessage(null);
    setStatusMessage("正在准备备份…");
    try {
      const backup = await createGardenBackup();
      downloadBackup(backup.blob, backup.fileName);
      setStatusMessage("备份已经导出。请妥善保存下载的文件。");
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(gardenBackupErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  async function readBackupFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined || isPending) return;
    setIsReading(true);
    setImportState(null);
    setErrorMessage(null);
    setStatusMessage("正在检查备份…");
    try {
      const preflight = await preflightGardenBackup(file);
      setImportState({ file, preflight });
      setStatusMessage("备份检查通过。确认前不会修改当前花园。");
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(gardenBackupErrorMessage(error));
    } finally {
      setIsReading(false);
    }
  }

  async function confirmRestore(): Promise<void> {
    if (importState === null || isPending) return;
    setIsRestoring(true);
    setErrorMessage(null);
    try {
      await restoreGardenBackup(importState.file);
      sessionStorage.setItem(RESTORE_COMPLETED_SESSION_KEY, "true");
      setIsConfirmOpen(false);
      onRestoreCompleted();
    } catch (error) {
      setErrorMessage(gardenBackupErrorMessage(error));
    } finally {
      setIsRestoring(false);
    }
  }

  const summary = importState?.preflight.summary;

  return (
    <>
      <ModalDialog
        className="m-auto max-h-[90vh] w-[min(92vw,44rem)] overflow-y-auto rounded-lg border border-garden-line bg-garden-paper p-0 shadow-2xl"
        describedBy={descriptionId}
        isOpen={isOpen}
        isPending={isPending}
        labelledBy={titleId}
        onRequestClose={onClose}
      >
        <header className="border-b border-garden-line px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold text-garden-accent">本地数据</p>
          <h2 className="mt-1 font-display text-2xl font-semibold" id={titleId}>
            数据与备份
          </h2>
          <p className="mt-2 text-sm leading-6 text-garden-muted" id={descriptionId}>
            碎片花园的数据保存在当前浏览器中。你可以导出一份备份文件，并在之后恢复。
          </p>
        </header>

        <div className="divide-y divide-garden-line px-6 sm:px-8">
          <section className="py-6" aria-labelledby="backup-export-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold" id="backup-export-title">
                  导出备份
                </h3>
                <p className="mt-1 text-sm leading-6 text-garden-muted">
                  下载当前花园的完整副本，包括本地图片和历史媒体。
                </p>
              </div>
              <AsyncButton
                className="shrink-0 rounded-md bg-garden-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-garden-accent-strong disabled:opacity-60"
                disabled={isPending}
                isPending={isExporting}
                onClick={() => void exportBackup()}
                pendingLabel="正在准备…"
                type="button"
              >
                导出备份
              </AsyncButton>
            </div>
          </section>

          <section className="py-6" aria-labelledby="backup-import-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold" id="backup-import-title">
                  从备份恢复
                </h3>
                <p className="mt-1 text-sm leading-6 text-garden-muted">
                  先检查文件内容，再由你确认是否替换当前花园。
                </p>
              </div>
              <button
                className="shrink-0 rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold hover:bg-garden-soft disabled:opacity-50"
                disabled={isPending}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                选择备份文件
              </button>
              <input
                accept=".json,application/json"
                aria-label="选择碎片花园备份文件"
                className="sr-only"
                onChange={(event) => void readBackupFile(event)}
                ref={fileInputRef}
                type="file"
              />
            </div>

            {summary !== undefined && importState !== null ? (
              <div className="mt-5 border-l-2 border-garden-accent pl-4">
                <p className="break-all text-sm font-semibold">{importState.file.name}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-garden-muted">备份时间</dt>
                    <dd className="mt-0.5 font-semibold">{formatBackupTime(summary.exportedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-garden-muted">笔记</dt>
                    <dd className="mt-0.5 font-semibold">{summary.noteCount}</dd>
                  </div>
                  <div>
                    <dt className="text-garden-muted">植物</dt>
                    <dd className="mt-0.5 font-semibold">{summary.plantCount}</dd>
                  </div>
                  <div>
                    <dt className="text-garden-muted">图片</dt>
                    <dd className="mt-0.5 font-semibold">{summary.imageCount}</dd>
                  </div>
                  <div>
                    <dt className="text-garden-muted">追加笔记</dt>
                    <dd className="mt-0.5 font-semibold">{summary.appendedNoteCount}</dd>
                  </div>
                  <div>
                    <dt className="text-garden-muted">发芽关系</dt>
                    <dd className="mt-0.5 font-semibold">{summary.sproutRelationCount}</dd>
                  </div>
                  <div>
                    <dt className="text-garden-muted">处理中任务</dt>
                    <dd className="mt-0.5 font-semibold">{summary.processingJobCount}</dd>
                  </div>
                  {summary.historicalMediaCount > 0 ? (
                    <div>
                      <dt className="text-garden-muted">历史媒体</dt>
                      <dd className="mt-0.5 font-semibold">{summary.historicalMediaCount}</dd>
                    </div>
                  ) : null}
                </dl>
                <button
                  className="mt-5 rounded-md bg-garden-danger px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
                  disabled={isPending}
                  onClick={() => setIsConfirmOpen(true)}
                  type="button"
                >
                  用这份备份恢复
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <div aria-live="polite" className="min-h-6 px-6 text-sm sm:px-8">
          {statusMessage !== null ? (
            <p className="font-semibold text-garden-accent" role="status">
              {statusMessage}
            </p>
          ) : null}
          {errorMessage !== null && !isConfirmOpen ? (
            <p className="font-semibold text-garden-danger" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="mt-4 flex justify-end border-t border-garden-line px-6 py-4 sm:px-8">
          <button
            className="rounded-md border border-garden-line px-5 py-2.5 text-sm font-semibold hover:bg-garden-soft disabled:opacity-50"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </footer>
      </ModalDialog>

      <ConfirmDialog
        confirmLabel="确认恢复"
        description="恢复后，当前浏览器中的花园将被备份内容替换。此操作完成前不会修改现有数据。"
        errorMessage={isConfirmOpen ? errorMessage : null}
        isOpen={isConfirmOpen}
        isPending={isRestoring}
        onCancel={() => {
          if (!isRestoring) setIsConfirmOpen(false);
        }}
        onConfirm={() => void confirmRestore()}
        pendingLabel="正在恢复…"
        title="用备份替换当前花园？"
      />
    </>
  );
}
