import type { BrowserContext, Page } from "@playwright/test";

export type StoredFragment = {
  analysisStatus: string;
  completionStatus: string;
  contentType: string;
  id: string;
  lastInteractedAt: string;
  lifecycleStatus: string;
  rawText: string | null;
  sourceUrl: string | null;
  summary: string | null;
  title: string;
};

export type StoredPlant = {
  fragmentId: string;
  growthScore: number;
  id: string;
  slotId: string | null;
  stage: string;
  vitality: string;
};

export type StoredFragmentEvent = {
  fragmentId: string;
  id: string;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  type: string;
};

export type StoredExternalLinkImport = {
  attemptCount: number;
  fragmentId: string;
  id: string;
  status: string;
  taskId: string | null;
};

export type StoredChatMessage = {
  content: string;
  fragmentId: string | null;
  id: string;
  role: string;
};

export type StoredMediaAsset = {
  id: string;
  fragmentId: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: string;
  processingRequestId: string | null;
  summary: string | null;
  visibleText: string | null;
  generatedTitle: string | null;
  transcript: string | null;
  blobSize: number;
};

export type FragmentGardenPersistenceState = {
  chatMessages: StoredChatMessage[];
  mediaAssets: StoredMediaAsset[];
  externalLinkImports: StoredExternalLinkImport[];
  fragmentEvents: StoredFragmentEvent[];
  fragments: StoredFragment[];
  getNoteDisclosureAcceptedAt: string | null;
  openAiDisclosureAcceptedAt: string | null;
  plants: StoredPlant[];
  sproutAiDisclosureAcceptedAt: string | null;
  imageAiDisclosureAcceptedAt: string | null;
  voiceAiDisclosureAcceptedAt: string | null;
};

export async function clearFragmentGardenIndexedDb(
  context: BrowserContext,
  page: Page,
  baseURL: string,
): Promise<void> {
  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("Storage.clearDataForOrigin", {
    origin: new URL(baseURL).origin,
    storageTypes: "indexeddb",
  });
  await cdpSession.detach();
}

export function readFragmentGardenPersistence(page: Page): Promise<FragmentGardenPersistenceState> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("fragment-garden");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const storeNames = [
      "settings",
      "fragments",
      "plants",
      "fragmentEvents",
      "externalLinkImports",
      "chatMessages",
      "mediaAssets",
    ].filter((name) => database.objectStoreNames.contains(name));
    const transaction = database.transaction(storeNames, "readonly");
    const readAll = <T>(storeName: string): Promise<T[]> =>
      new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      });
    const readSettings = (): Promise<
      | {
          getNoteDisclosureAcceptedAt?: string | null;
          openAiDisclosureAcceptedAt?: string | null;
          sproutAiDisclosureAcceptedAt?: string | null;
          imageAiDisclosureAcceptedAt?: string | null;
          voiceAiDisclosureAcceptedAt?: string | null;
        }
      | undefined
    > =>
      new Promise((resolve, reject) => {
        const request = transaction.objectStore("settings").get("local-user");
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve(
            request.result as
              | {
                  getNoteDisclosureAcceptedAt?: string | null;
                  openAiDisclosureAcceptedAt?: string | null;
                  sproutAiDisclosureAcceptedAt?: string | null;
                  imageAiDisclosureAcceptedAt?: string | null;
                  voiceAiDisclosureAcceptedAt?: string | null;
                }
              | undefined,
          );
      });
    const [
      settings,
      fragments,
      plants,
      fragmentEvents,
      externalLinkImports,
      chatMessages,
      mediaAssets,
    ] = await Promise.all([
      readSettings(),
      readAll<StoredFragment>("fragments"),
      readAll<StoredPlant>("plants"),
      readAll<StoredFragmentEvent>("fragmentEvents"),
      readAll<StoredExternalLinkImport>("externalLinkImports"),
      readAll<StoredChatMessage>("chatMessages"),
      database.objectStoreNames.contains("mediaAssets")
        ? readAll<{
            id: string;
            fragmentId: string;
            kind: string;
            mimeType: string;
            sizeBytes: number;
            processingStatus: string;
            processingRequestId: string | null;
            summary: string | null;
            visibleText: string | null;
            generatedTitle: string | null;
            transcript: string | null;
            blob: Blob;
          }>("mediaAssets")
        : Promise.resolve([]),
    ]);

    database.close();
    return {
      chatMessages,
      mediaAssets: mediaAssets.map((asset) => ({
        id: asset.id,
        fragmentId: asset.fragmentId,
        kind: asset.kind,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        processingStatus: asset.processingStatus,
        processingRequestId: asset.processingRequestId,
        summary: asset.summary,
        visibleText: asset.visibleText,
        generatedTitle: asset.generatedTitle,
        transcript: asset.transcript,
        blobSize: asset.blob.size,
      })),
      externalLinkImports,
      fragmentEvents,
      fragments,
      getNoteDisclosureAcceptedAt: settings?.getNoteDisclosureAcceptedAt ?? null,
      openAiDisclosureAcceptedAt: settings?.openAiDisclosureAcceptedAt ?? null,
      plants,
      sproutAiDisclosureAcceptedAt: settings?.sproutAiDisclosureAcceptedAt ?? null,
      imageAiDisclosureAcceptedAt: settings?.imageAiDisclosureAcceptedAt ?? null,
      voiceAiDisclosureAcceptedAt: settings?.voiceAiDisclosureAcceptedAt ?? null,
    };
  });
}
