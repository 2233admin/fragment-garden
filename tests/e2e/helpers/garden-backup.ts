import { expect, type Download, type Page } from "@playwright/test";

export const BACKUP_SOURCE_TITLE = "备份来源笔记";
export const BACKUP_CHILD_TITLE = "备份发芽笔记";
export const BACKUP_IMAGE_TITLE = "备份图片笔记";

export async function clearAllGardenTables(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const storeNames = Array.from(database.objectStoreNames);
    const transaction = database.transaction(storeNames, "readwrite");
    for (const storeName of storeNames) transaction.objectStore(storeName).clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
}

export async function seedGardenBackupFixture(
  page: Page,
  options: Readonly<{ includeInterruptedJobs?: boolean; currentOnly?: boolean }> = {},
): Promise<void> {
  await clearAllGardenTables(page);
  await page.evaluate(
    async ({ includeInterruptedJobs, currentOnly }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("fragment-garden");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const stores = Array.from(database.objectStoreNames);
      const transaction = database.transaction(stores, "readwrite");
      const now = "2026-07-26T10:15:00.000Z";
      const put = (storeName: string, value: unknown): void => {
        transaction.objectStore(storeName).put(value);
      };
      const fragment = (
        id: string,
        title: string,
        contentType: "text" | "image",
        parentFragmentId: string | null = null,
      ) => ({
        id,
        contentType,
        title,
        rawText: contentType === "text" ? title : null,
        sourceUrl: null,
        contentMarkdown: `# ${title}\n\n这是恢复验收正文。`,
        summary: null,
        keywords: [],
        lifecycleStatus: "active",
        completionStatus: "open",
        analysisStatus: contentType === "text" ? "not_required" : "completed",
        embedding: null,
        parentFragmentId,
        createdAt: now,
        updatedAt: now,
        lastInteractedAt: now,
        completedAt: null,
      });
      const plant = (id: string, fragmentId: string, slotId: string) => ({
        id,
        fragmentId,
        speciesId: null,
        stage: "seedling",
        vitality: "active",
        growthScore: 0,
        slotId,
        createdAt: now,
        updatedAt: now,
      });

      put("settings", {
        id: "local-user",
        onboardingCompleted: true,
        companionType: "cat",
        lastOpenedAt: null,
        lastRecommendationDate: null,
        getNoteDisclosureAcceptedAt: null,
        openAiDisclosureAcceptedAt: null,
        companionAiMode: "local",
        sproutAiDisclosureAcceptedAt: null,
        imageAiDisclosureAcceptedAt: null,
        voiceAiDisclosureAcceptedAt: null,
        schemaVersion: 1,
      });

      if (currentOnly) {
        put("fragments", fragment("current-only", "恢复前的当前笔记", "text"));
        put("plants", plant("current-only-plant", "current-only", "slot-10"));
        put("fragmentEvents", {
          id: "current-only-created",
          fragmentId: "current-only",
          type: "created",
          payload: null,
          occurredAt: now,
          ruleVersion: 1,
        });
      } else {
        put("fragments", fragment("backup-source", "备份来源笔记", "text"));
        put("fragments", fragment("backup-child", "备份发芽笔记", "text", "backup-source"));
        put("fragments", fragment("backup-image", "备份图片笔记", "image"));
        put("plants", plant("backup-source-plant", "backup-source", "slot-01"));
        put("plants", plant("backup-child-plant", "backup-child", "slot-02"));
        put("plants", plant("backup-image-plant", "backup-image", "slot-03"));
        for (const fragmentId of ["backup-source", "backup-child", "backup-image"]) {
          put("fragmentEvents", {
            id: `${fragmentId}-created`,
            fragmentId,
            type: "created",
            payload: null,
            occurredAt: now,
            ruleVersion: 1,
          });
        }
        put("fragmentNotes", {
          id: "backup-note-1",
          fragmentId: "backup-source",
          contentMarkdown: "第一条恢复用追加笔记。",
          source: "user",
          createdAt: now,
          updatedAt: now,
        });
        put("fragmentNotes", {
          id: "backup-note-2",
          fragmentId: "backup-source",
          contentMarkdown: "第二条恢复用追加笔记。",
          source: "user",
          createdAt: now,
          updatedAt: now,
        });
        put("relations", {
          id: "backup-sprout-relation",
          sourceFragmentId: "backup-child",
          targetFragmentId: "backup-source",
          relationType: "grows_from",
          status: "confirmed",
          similarityScore: null,
          explanation: null,
          createdAt: now,
          confirmedAt: now,
        });
        const binary = atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgAAAAAgAB4iG8MAAAAABJRU5ErkJggg==",
        );
        const imageBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const imageBlob = new Blob([imageBytes], { type: "image/png" });
        put("mediaAssets", {
          id: "backup-image-asset",
          fragmentId: "backup-image",
          kind: "image",
          blob: imageBlob,
          mimeType: imageBlob.type,
          fileName: "backup.png",
          sizeBytes: imageBlob.size,
          width: 1,
          height: 1,
          durationMs: null,
          processingStatus: "completed",
          processingRequestId: null,
          errorCode: null,
          temporaryTitle: null,
          generatedTitle: "备份图片笔记",
          summary: "一张用于备份验收的图片。",
          visibleText: "备份测试",
          contentKind: "screenshot",
          transcript: null,
          originalTranscript: null,
          transcriptEditedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (includeInterruptedJobs) {
        const createJob = (id: string, kind: "link" | "image" | "sprout") => {
          const sourceBlob =
            kind === "image" ? new Blob(["pending-image"], { type: "image/png" }) : null;
          return {
            id,
            kind,
            status: "processing",
            sourceUrl: kind === "link" ? "https://example.com/pending" : null,
            normalizedSourceUrl: kind === "link" ? "https://example.com/pending" : null,
            allowDuplicate: false,
            initiator: kind === "link" ? "form" : null,
            userTitle: null,
            userNoteMarkdown: null,
            sourceBlob,
            sourceMimeType: sourceBlob?.type ?? null,
            sourceFileName: sourceBlob === null ? null : "pending.png",
            sourceWidth: sourceBlob === null ? null : 1,
            sourceHeight: sourceBlob === null ? null : 1,
            sourceFragmentId: kind === "sprout" ? "current-only" : null,
            sourceSnapshot: kind === "sprout" ? "{}" : null,
            createdFragmentId: null,
            providerTaskId: "provider-task",
            processingRequestId: "processing-request",
            resultTitle: null,
            resultMarkdown: null,
            errorCode: null,
            errorMessage: null,
            attemptCount: 1,
            attemptGeneration: 1,
            createdAt: now,
            updatedAt: now,
            startedAt: now,
            lastPolledAt: now,
          };
        };
        put("contentProcessingJobs", createJob("restored-link-job", "link"));
        put("contentProcessingJobs", createJob("restored-image-job", "image"));
        put("contentProcessingJobs", createJob("restored-sprout-job", "sprout"));
      }

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    {
      includeInterruptedJobs: options.includeInterruptedJobs === true,
      currentOnly: options.currentOnly === true,
    },
  );
}

export async function exportGardenBackupFromDialog(page: Page): Promise<Download> {
  await page.getByRole("button", { name: "数据与备份", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "数据与备份" });
  await expect(dialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出备份", exact: true }).click();
  const download = await downloadPromise;
  await expect(dialog.getByText("备份已经导出。请妥善保存下载的文件。")).toBeVisible();
  return download;
}

export async function selectBackupFile(page: Page, path: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "数据与备份" });
  await dialog.getByLabel("选择碎片花园备份文件").setInputFiles(path);
}
