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
    const img = new window.Image();
    img.onload = () => {
      if (loadGenRef.current !== gen) return;
      setDisplayUrl(next);
    };
    img.src = next;

    return () => {
      loadGenRef.current += 1;
      img.onload = null;
      img.onerror = null;
    };
  }, [coverUrl, displayUrl]);

  return displayUrl;
}
