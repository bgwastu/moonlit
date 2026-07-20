"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keep showing the last painted cover while a replacement URL loads.
 * Avoids a blank flash when provisional YouTube thumbs upgrade to album art.
 */
export function useStableCoverUrl(
  coverUrl: string | undefined,
  trackKey: string | undefined,
): string {
  const [displayUrl, setDisplayUrl] = useState(() => coverUrl || "");
  const [displayTrackKey, setDisplayTrackKey] = useState(trackKey);
  const loadGenRef = useRef(0);

  // Reset immediately when the track changes (adjust state during render).
  if (trackKey !== displayTrackKey) {
    setDisplayTrackKey(trackKey);
    setDisplayUrl(coverUrl || "");
  } else if (!displayUrl && coverUrl) {
    // First cover for this track — adopt without waiting for preload.
    setDisplayUrl(coverUrl);
  }

  useEffect(() => {
    const next = coverUrl || "";
    // Same track with no cover yet — keep the last painted art through processing.
    if (!next || next === displayUrl) return;

    const gen = ++loadGenRef.current;
    const loaders: HTMLImageElement[] = [];

    const adopt = (url: string) => {
      if (loadGenRef.current !== gen) return;
      setDisplayUrl(url);
    };

    const preload = (url: string, allowProxyRetry: boolean) => {
      const img = new window.Image();
      loaders.push(img);
      img.onload = () => adopt(url);
      img.onerror = () => {
        if (loadGenRef.current !== gen) return;
        // Remote CDN often fails without our cover proxy — retry once via /api/cover.
        if (allowProxyRetry && url.startsWith("http") && !url.includes("/api/cover")) {
          preload(`/api/cover?url=${encodeURIComponent(url)}`, false);
          return;
        }
        // Adopt anyway so a later upgrade can replace it; avoids stuck blank art.
        adopt(url);
      };
      img.src = url;
    };

    preload(next, true);

    return () => {
      loadGenRef.current += 1;
      for (const img of loaders) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [coverUrl, displayUrl]);

  return displayUrl;
}
