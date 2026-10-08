"use client";

import { useEffect, useRef, useState } from "react";
import { getCachedCoverUrl, setCoverCache } from "@/utils/cache";

function isLocalCoverUrl(url: string | undefined): boolean {
  return Boolean(url && (url.startsWith("blob:") || url.startsWith("data:")));
}

async function canDecodeCover(url: string): Promise<boolean> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  } catch {
    return false;
  }
}

/** Keep validated artwork on screen while loading a replacement for the same track. */
export function useStableCoverUrl(
  coverUrl: string | undefined,
  trackKey: string | undefined,
  { cacheOnly = false }: { cacheOnly?: boolean } = {},
): string {
  const [displayUrl, setDisplayUrl] = useState("");
  const [displayTrackKey, setDisplayTrackKey] = useState(trackKey);
  const ownedUrls = useRef(new Set<string>());

  // Reset immediately when the track changes (adjust state during render).
  if (trackKey !== displayTrackKey) {
    setDisplayTrackKey(trackKey);
    setDisplayUrl("");
  }

  useEffect(() => {
    const next = coverUrl || "";
    let cancelled = false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const urls = ownedUrls.current;

    const discard = (url: string) => {
      if (urls.delete(url)) URL.revokeObjectURL(url);
    };
    const adopt = async (url: string, owned = false) => {
      if (owned) urls.add(url);
      if (cancelled || !(await canDecodeCover(url)) || cancelled) {
        if (owned) discard(url);
        return false;
      }
      setDisplayUrl(url);
      return true;
    };

    const load = async () => {
      if (isLocalCoverUrl(next)) {
        await adopt(next);
        return;
      }

      if (trackKey) {
        const cached = next ? await getCachedCoverUrl(trackKey, next) : null;
        if (cached && (await adopt(cached, true))) return;
        // Recover older saved artwork even if its metadata URL changed or expired.
        const previous = await getCachedCoverUrl(trackKey);
        if (previous) await adopt(previous, true);
      }
      if (!next || cancelled || cacheOnly) return;

      try {
        timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(next, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith("image/")) return;
        if (!(await adopt(URL.createObjectURL(blob), true))) return;
        // Corrupt or non-image responses never become the saved offline cover.
        if (trackKey) await setCoverCache(trackKey, next, blob);
      } catch {
        // Retain a decoded cached cover, or let the UI display its artwork fallback.
      } finally {
        clearTimeout(timeout);
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [coverUrl, trackKey, cacheOnly]);

  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      if (urls.delete(displayUrl)) URL.revokeObjectURL(displayUrl);
    };
  }, [displayUrl]);

  useEffect(() => {
    const urls = ownedUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  return displayUrl;
}
