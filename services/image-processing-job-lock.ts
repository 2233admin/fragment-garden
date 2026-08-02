type LockRelease = () => void;
type LockWaiter = Readonly<{
  onAbort: () => void;
  resolve: (release: LockRelease | null) => void;
  signal: AbortSignal | null;
}>;
type LockState = { isLocked: boolean; waiters: LockWaiter[] };

export type ImageProcessingJobLockResult<T> =
  Readonly<{ acquired: false }> | Readonly<{ acquired: true; value: T }>;

type ImageProcessingJobLockOptions = Readonly<{
  databaseName: string;
  ifAvailable?: boolean;
  signal?: AbortSignal;
}>;

const MODULE_IMAGE_JOB_LOCKS = new Map<string, LockState>();

function createRelease(lockName: string, state: LockState): LockRelease {
  let didRelease = false;

  return () => {
    if (didRelease) return;
    didRelease = true;

    while (state.waiters.length > 0) {
      const waiter = state.waiters.shift();
      if (waiter === undefined) break;
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal?.aborted === true) {
        waiter.resolve(null);
        continue;
      }
      waiter.resolve(createRelease(lockName, state));
      return;
    }

    state.isLocked = false;
    if (MODULE_IMAGE_JOB_LOCKS.get(lockName) === state) {
      MODULE_IMAGE_JOB_LOCKS.delete(lockName);
    }
  };
}

function acquireModuleLock(
  lockName: string,
  signal: AbortSignal | undefined,
  ifAvailable: boolean,
): Promise<LockRelease | null> {
  if (signal?.aborted === true) return Promise.resolve(null);

  const state = MODULE_IMAGE_JOB_LOCKS.get(lockName) ?? { isLocked: false, waiters: [] };
  MODULE_IMAGE_JOB_LOCKS.set(lockName, state);
  if (!state.isLocked) {
    state.isLocked = true;
    return Promise.resolve(createRelease(lockName, state));
  }
  if (ifAvailable) return Promise.resolve(null);

  return new Promise((resolve) => {
    const waiter: LockWaiter = {
      signal: signal ?? null,
      onAbort: () => {
        const index = state.waiters.indexOf(waiter);
        if (index >= 0) state.waiters.splice(index, 1);
        resolve(null);
      },
      resolve,
    };
    state.waiters.push(waiter);
    signal?.addEventListener("abort", waiter.onAbort, { once: true });
  });
}

function getWebLockManager(): LockManager | null {
  return typeof navigator !== "undefined" &&
    navigator.locks !== undefined &&
    typeof navigator.locks.request === "function"
    ? navigator.locks
    : null;
}

export async function runWithImageProcessingJobLock<T>(
  jobId: string,
  options: ImageProcessingJobLockOptions,
  operation: () => Promise<T>,
): Promise<ImageProcessingJobLockResult<T>> {
  const lockName = `fragment-garden:content-processing:image:${options.databaseName}:${jobId}`;
  const ifAvailable = options.ifAvailable === true;
  const webLocks = getWebLockManager();

  if (webLocks !== null) {
    return webLocks.request(
      lockName,
      {
        ifAvailable,
        mode: "exclusive",
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
      async (lock) =>
        lock === null ? { acquired: false } : { acquired: true, value: await operation() },
    );
  }

  // Browsers without Web Locks cannot coordinate tabs. The module lock still
  // prevents Strict Mode and same-page workers from racing the same job.
  const release = await acquireModuleLock(lockName, options.signal, ifAvailable);
  if (release === null) return { acquired: false };
  try {
    return { acquired: true, value: await operation() };
  } finally {
    release();
  }
}
