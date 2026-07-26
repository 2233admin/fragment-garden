export const LOCAL_STORAGE_FULL_MESSAGE =
  "当前浏览器的本地存储空间不足。你的已有内容没有被修改，可以删除不需要的内容后重试。";

function relatedErrors(error: unknown): unknown[] {
  if (typeof error !== "object" || error === null) return [];

  const candidate = error as Readonly<{
    cause?: unknown;
    inner?: unknown;
    failures?: unknown;
  }>;
  return [candidate.cause, candidate.inner, candidate.failures].filter(
    (value) => value !== undefined,
  );
}

/** Detect native and Dexie-wrapped quota errors without exposing their details to the UI. */
export function isQuotaExceededError(error: unknown): boolean {
  const queue = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);

    if (typeof current === "object" && current !== null && "name" in current) {
      const name = (current as { name?: unknown }).name;
      if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
    }

    if (Array.isArray(current)) queue.push(...current);
    else queue.push(...relatedErrors(current));
  }

  return false;
}

export function localPersistenceErrorMessage(error: unknown, fallback: string): string {
  return isQuotaExceededError(error) ? LOCAL_STORAGE_FULL_MESSAGE : fallback;
}
