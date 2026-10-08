"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useYouTubeStatus } from "@/context/YouTubeStatusContext";
import { loadCachedCover } from "@/lib/storage";

/** Keep validated artwork on screen while loading a replacement for the same track. */
export function useStableCoverUrl(
  coverUrl: string | undefined,
  trackKey: string | undefined,
  { saved = true }: { saved?: boolean } = {},
): { url: string; isLoading: boolean } {
  const { localOnly } = useYouTubeStatus();
  const request = useMemo(
    () => ({ coverUrl, trackKey, saved, localOnly }),
    [coverUrl, trackKey, saved, localOnly],
  );
  const [displayUrl, setDisplayUrl] = useState("");
  const [displayTrackKey, setDisplayTrackKey] = useState(trackKey);
  const [settledRequest, setSettledRequest] = useState<typeof request | null>(null);
  const ownedUrls = useRef(new Set<string>());

  // Reset immediately when the track changes (adjust state during render).
  if (trackKey !== displayTrackKey) {
    setDisplayTrackKey(trackKey);
    setDisplayUrl("");
  }

  useEffect(() => {
    const { coverUrl, trackKey, saved, localOnly } = request;
    const next = coverUrl || "";
    let cancelled = false;
    const urls = ownedUrls.current;

    const discard = (url: string) => {
      if (urls.delete(url)) URL.revokeObjectURL(url);
    };
    const adopt = (url: string) => {
      urls.add(url);
      if (cancelled) {
        discard(url);
        return;
      }
      setDisplayUrl(url);
    };

    const load = async () => {
      try {
        if (!next && !trackKey) return;
        const blob = await loadCachedCover(trackKey || "", next, {
          saved,
          cacheOnly: localOnly,
        });
        if (blob && !cancelled) adopt(URL.createObjectURL(blob));
      } catch {
        // Retain a decoded cached cover, or let the UI display its artwork fallback.
      } finally {
        if (!cancelled) setSettledRequest(request);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [request]);

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

  return {
    url: displayUrl,
    isLoading: Boolean(coverUrl || trackKey) && settledRequest !== request,
  };
}
