"use client";

import { useEffect, useRef, useState } from "react";

import { useBlobObjectUrl } from "../media/useBlobObjectUrl";

type ImageCardThumbnailProps = {
  blob: Blob | null;
  title: string;
};

export function ImageCardThumbnail({ blob, title }: ImageCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [failedObjectUrl, setFailedObjectUrl] = useState<string | null>(null);
  const objectUrl = useBlobObjectUrl(isVisible ? blob : null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="aspect-[16/9] w-full overflow-hidden rounded-md bg-garden-soft" ref={rootRef}>
      {objectUrl !== null && failedObjectUrl !== objectUrl ? (
        // The URL is created lazily and revoked when this card leaves the tree.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`用户上传的图片：${title}`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailedObjectUrl(objectUrl)}
          src={objectUrl}
        />
      ) : (
        <span className="flex h-full items-center justify-center text-sm font-semibold text-garden-muted">
          图片
        </span>
      )}
    </div>
  );
}
