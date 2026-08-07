"use client";

import { useEffect, useRef, useState } from "react";
import { getCachedCoverUrl, setCoverCache } from "@/utils/cache";

function isLocalCoverUrl(url: string | undefined): boolean {
  return Boolean(url && (url.startsWith("blob:") || url.startsWith("data:")));
}

/**
 * Keep showing the last painted cover while a replacement URL loads.
 * Avoids a blank flash when provisional YouTube thumbs upgrade to album art.
 */
export function useStableCoverUrl(
  coverUrl: string | undefined,
  trackKey: string | undefined,
): string {
  const [displayUrl, setDisplayUrl] = useState(() =>
    isLocalCoverUrl(coverUrl) ? coverUrl || "" : "",
  );
  const [displayTrackKey, setDisplayTrackKey] = useState(trackKey);
  const loadGenRef = useRef(0);

  // Reset immediately when the track changes (adjust state during render).
  if (trackKey !== displayTrackKey) {
    setDisplayTrackKey(trackKey);
    setDisplayUrl(isLocalCoverUrl(coverUrl) ? coverUrl || "" : "");
  }

  useEffect(() => {
    const next = coverUrl || "";
    if (!next) {
      // Keep the last painted art while metadata is temporarily incomplete.
      return;
    }

    if (isLocalCoverUrl(next)) {
      return;
    }

    const gen = ++loadGenRef.current;
    let cancelled = false;

    const adopt = (url: string) => {
      if (cancelled || loadGenRef.current !== gen) return;
      setDisplayUrl(url);
    };

    const load = async () => {
      if (trackKey) {
        const cached = await getCachedCoverUrl(trackKey, next);
        if (cached) {
          adopt(cached);
          return;
        }
      }

      try {
        const response = await fetch(next, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Cover request failed (${response.status})`);
        const blob = await response.blob();
        if (!blob.size) throw new Error("Empty cover response");
        if (trackKey) await setCoverCache(trackKey, next, blob);
        adopt(URL.createObjectURL(blob));
      } catch {
        // Keep a direct URL as a last resort when the proxy is temporarily unavailable.
        adopt(next);
      }
    };

    void load();

    return () => {
      cancelled = true;
      loadGenRef.current += 1;
    };
  }, [coverUrl, trackKey]);

  return displayUrl;
}
