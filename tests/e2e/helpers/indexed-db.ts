import type { BrowserContext, Page } from "@playwright/test";

export type StoredFragment = {
  analysisStatus: string;
  contentType: string;
  id: string;
  rawText: string | null;
  sourceUrl: string | null;
  summary: string | null;
  title: string;
};

export type StoredPlant = {
  fragmentId: string;
  id: string;
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

export type FragmentGardenPersistenceState = {
  chatMessages: StoredChatMessage[];
  externalLinkImports: StoredExternalLinkImport[];
  fragments: StoredFragment[];
  getNoteDisclosureAcceptedAt: string | null;
  plants: StoredPlant[];
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
    const transaction = database.transaction(
      ["settings", "fragments", "plants", "externalLinkImports", "chatMessages"],
      "readonly",
    );
    const readAll = <T>(storeName: string): Promise<T[]> =>
      new Promise<T[]>((resolve, reject) => {
        const request = transaction.objectStore(storeName).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      });
    const readSettings = (): Promise<{ getNoteDisclosureAcceptedAt?: string | null } | undefined> =>
      new Promise((resolve, reject) => {
        const request = transaction.objectStore("settings").get("local-user");
        request.onerror = () => reject(request.error);
        request.onsuccess = () =>
          resolve(request.result as { getNoteDisclosureAcceptedAt?: string | null } | undefined);
      });
    const [settings, fragments, plants, externalLinkImports, chatMessages] = await Promise.all([
      readSettings(),
      readAll<StoredFragment>("fragments"),
      readAll<StoredPlant>("plants"),
      readAll<StoredExternalLinkImport>("externalLinkImports"),
      readAll<StoredChatMessage>("chatMessages"),
    ]);

    database.close();
    return {
      chatMessages,
      externalLinkImports,
      fragments,
      getNoteDisclosureAcceptedAt: settings?.getNoteDisclosureAcceptedAt ?? null,
      plants,
    };
  });
}
