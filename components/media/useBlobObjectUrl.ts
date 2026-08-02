"use client";

import { useEffect, useState } from "react";

type ObjectUrlApi = Readonly<{
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}>;

export type BlobObjectUrlLease = Readonly<{
  url: string;
  release(): void;
}>;

export function createBlobObjectUrlLease(
  blob: Blob,
  urlApi: ObjectUrlApi = URL,
): BlobObjectUrlLease | null {
  let url: string;
  try {
    url = urlApi.createObjectURL(blob);
  } catch {
    return null;
  }

  let isReleased = false;
  return {
    url,
    release() {
      if (isReleased) return;
      isReleased = true;
      urlApi.revokeObjectURL(url);
    },
  };
}

/** Creates one short-lived Object URL and always releases it when the Blob changes. */
export function useBlobObjectUrl(blob: Blob | null): string | null {
  const [resource, setResource] = useState<{ blob: Blob | null; url: string | null }>({
    blob: null,
    url: null,
  });

  useEffect(() => {
    const lease = blob === null ? null : createBlobObjectUrlLease(blob);
    let isActive = true;
    Promise.resolve().then(() => {
      if (isActive) setResource({ blob, url: lease?.url ?? null });
    });

    return () => {
      isActive = false;
      lease?.release();
    };
  }, [blob]);

  return resource.blob === blob ? resource.url : null;
}
