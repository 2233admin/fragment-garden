const RESTORE_LOCK_NAME = "fragment-garden:restore";
const RESTORE_CHANNEL_NAME = "fragment-garden:data-replaced";
export const RESTORE_COMPLETED_SESSION_KEY = "fragment-garden:restore-completed";
const RESTORE_CLIENT_ID = crypto.randomUUID();

export type GardenRestoreBroadcastEvent = Readonly<{
  type: "started" | "completed" | "failed";
  operationId: string;
}>;

let localRestoreQueue: Promise<void> = Promise.resolve();

async function runWithLocalRestoreLock<T>(operation: () => Promise<T>): Promise<T> {
  let release: () => void = () => undefined;
  const previous = localRestoreQueue;
  localRestoreQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function runWithGardenRestoreLock<T>(operation: () => Promise<T>): Promise<T> {
  if (
    typeof navigator !== "undefined" &&
    navigator.locks !== undefined &&
    typeof navigator.locks.request === "function"
  ) {
    return navigator.locks.request(RESTORE_LOCK_NAME, { mode: "exclusive" }, operation);
  }

  // IndexedDB's all-store write transaction remains the final atomic boundary.
  // This queue prevents duplicate restore actions in browsers without Web Locks.
  return runWithLocalRestoreLock(operation);
}

export function publishGardenRestoreEvent(event: GardenRestoreBroadcastEvent): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(RESTORE_CHANNEL_NAME);
  channel.postMessage({ ...event, senderId: RESTORE_CLIENT_ID });
  channel.close();
}

export function subscribeToGardenRestoreEvents(
  listener: (event: GardenRestoreBroadcastEvent) => void,
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(RESTORE_CHANNEL_NAME);
  channel.addEventListener("message", (message: MessageEvent<unknown>) => {
    const value = message.data;
    if (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      "operationId" in value &&
      "senderId" in value &&
      (value.type === "started" || value.type === "completed" || value.type === "failed") &&
      typeof value.operationId === "string" &&
      typeof value.senderId === "string" &&
      value.senderId !== RESTORE_CLIENT_ID
    ) {
      listener({ type: value.type, operationId: value.operationId });
    }
  });
  return () => channel.close();
}
