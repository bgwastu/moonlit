"use client";

import { useCallback, useEffect, useState } from "react";
import { Lyric, parseLRC } from "@/lib/lyrics";

const LRCLIB_BASE = "https://lrclib.net/api";
const USER_AGENT = "Moonlit (https://github.com/bgwastu/moonlit)";

/** Require lyrics duration to match track duration 1:1 (within 1 second) */
function durationMatches(trackSeconds: number, recordSeconds: number): boolean {
  return Math.abs((recordSeconds ?? 0) - trackSeconds) <= 1;
}

interface LrclibResponse {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export type LyricsState = "idle" | "loading" | "ready" | "error" | "not_found";

interface UseLyricsOptions {
  trackName: string;
  artistName: string;
  durationSeconds: number;
  enabled: boolean;
  selectedSyncedLyrics?: string | null; // If provided, use this instead of fetching
  offsetSeconds?: number; // Offset to apply to lyrics timing
}

export interface DiscoveredLyrics {
  id: number;
  trackName: string;
  artistName: string;
  syncedLyrics: string;
}

interface UseLyricsReturn {
  lyrics: Lyric[];
  state: LyricsState;
  error: string | null;
  discoveredLyrics: DiscoveredLyrics | null;
  refetch: () => void;
}

/** Apply offset to parsed lyrics */
function applyOffset(lyrics: Lyric[], offsetMs: number): Lyric[] {
  if (offsetMs === 0) return lyrics;
  return lyrics.map((lyric) => ({
    ...lyric,
    startTimeMs: lyric.startTimeMs + offsetMs,
    parts: lyric.parts?.map((part) => ({
      ...part,
      startTimeMs: part.startTimeMs + offsetMs,
    })),
  }));
}

export function useLyrics({
  trackName,
  artistName,
  durationSeconds,
  enabled,
  selectedSyncedLyrics,
  offsetSeconds = 0,
}: UseLyricsOptions): UseLyricsReturn {
  const [lyrics, setLyrics] = useState<Lyric[]>([]);
  const [state, setState] = useState<LyricsState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [discoveredLyrics, setDiscoveredLyrics] = useState<DiscoveredLyrics | null>(null);

  const offsetMs = offsetSeconds * 1000;

  const fetchLyrics = useCallback(async () => {
    if (!trackName?.trim() || !artistName?.trim() || durationSeconds <= 0) {
      setLyrics([]);
      setState("idle");
      setDiscoveredLyrics(null);
      return;
    }
    setState("loading");
    setError(null);
    try {
      const params = new URLSearchParams({
        track_name: trackName.trim(),
        artist_name: artistName.trim(),
        album_name: "",
        duration: String(Math.round(durationSeconds)),
      });
      const res = await fetch(`${LRCLIB_BASE}/get?${params}`, {
        headers: { "Lrclib-Client": USER_AGENT },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setLyrics([]);
          setState("not_found");
          setDiscoveredLyrics(null);
          return;
        }
        throw new Error(`LRCLib ${res.status}`);
      }
      const data: LrclibResponse = await res.json();
      const recordDuration = data.duration ?? 0;
      if (!durationMatches(durationSeconds, recordDuration)) {
        setLyrics([]);
        setState("not_found");
        setDiscoveredLyrics(null);
        return;
      }
      const synced = data.syncedLyrics?.trim();
      if (!synced) {
        setLyrics([]);
        setState("not_found");
        setDiscoveredLyrics(null);
        return;
      }
      const durationMs = recordDuration * 1000;
      const parsed = parseLRC(synced, durationMs);
      setLyrics(applyOffset(parsed, offsetMs));
      setState(parsed.length > 0 ? "ready" : "not_found");

      // Store discovered lyrics metadata
      if (parsed.length > 0 && data.id) {
        setDiscoveredLyrics({
          id: data.id,
          trackName: data.trackName ?? trackName,
          artistName: data.artistName ?? artistName,
          syncedLyrics: synced,
        });
      } else {
        setDiscoveredLyrics(null);
      }
    } catch (e) {
      setLyrics([]);
      setState("error");
      setError(e instanceof Error ? e.message : "Failed to load lyrics");
      setDiscoveredLyrics(null);
    }
  }, [trackName, artistName, durationSeconds, offsetMs]);

  // Handle selected synced lyrics (user-selected override)
  useEffect(() => {
    if (!enabled) {
      setLyrics([]);
      setState("idle");
      setError(null);
      return;
    }

    if (selectedSyncedLyrics) {
      const durationMs = durationSeconds * 1000;
      const parsed = parseLRC(selectedSyncedLyrics, durationMs);
      setLyrics(applyOffset(parsed, offsetMs));
      setState(parsed.length > 0 ? "ready" : "not_found");
      return;
    }

    fetchLyrics();
  }, [enabled, selectedSyncedLyrics, durationSeconds, offsetMs, fetchLyrics]);

  return { lyrics, state, error, discoveredLyrics, refetch: fetchLyrics };
}
