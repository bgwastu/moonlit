"use client";

import { useCallback, useEffect, useState } from "react";
import { Lyric, LyricsSearchRecord, parseLRC } from "@/lib/lyrics";

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
  albumName?: string;
  syncedLyrics: string;
}

interface UseLyricsReturn {
  lyrics: Lyric[];
  state: LyricsState;
  error: string | null;
  discoveredLyrics: DiscoveredLyrics | null;
  searchResults: LyricsSearchRecord[];
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
  const [searchResults, setSearchResults] = useState<LyricsSearchRecord[]>([]);

  const offsetMs = offsetSeconds * 1000;

  const fetchLyrics = useCallback(async () => {
    if (!trackName?.trim() || !artistName?.trim() || durationSeconds <= 0) {
      setLyrics([]);
      setState("idle");
      setDiscoveredLyrics(null);
      setSearchResults([]);
      return;
    }
    setState("loading");
    setError(null);

    const getParams = new URLSearchParams({
      track_name: trackName.trim(),
      artist_name: artistName.trim(),
      album_name: "",
      duration: String(Math.round(durationSeconds)),
    });

    const searchParams = new URLSearchParams({
      q: `${trackName.trim()} ${artistName.trim()}`,
      track_name: trackName.trim(),
      artist_name: artistName.trim(),
    });

    try {
      // Run both requests in parallel
      const [getRes, searchRes] = await Promise.allSettled([
        fetch(`${LRCLIB_BASE}/get?${getParams}`, {
          headers: { "Lrclib-Client": USER_AGENT },
        }),
        fetch(`${LRCLIB_BASE}/search?${searchParams}`, {
          headers: { "Lrclib-Client": USER_AGENT },
        }),
      ]);

      // -- Handle Search Results --
      if (searchRes.status === "fulfilled" && searchRes.value.ok) {
        try {
          const searchData = (await searchRes.value.json()) as LyricsSearchRecord[];
          setSearchResults(Array.isArray(searchData) ? searchData : []);
        } catch {
          setSearchResults([]);
        }
      } else {
        setSearchResults([]);
      }

      // -- Handle Direct Get --
      if (getRes.status === "rejected" || !getRes.value.ok) {
        if (getRes.status === "fulfilled" && getRes.value.status === 404) {
          setLyrics([]);
          setState("not_found");
          setDiscoveredLyrics(null);
          return;
        }
        throw new Error(
          getRes.status === "fulfilled"
            ? `LRCLib ${getRes.value.status}`
            : "Network error",
        );
      }

      const data: LrclibResponse = await getRes.value.json();
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
          albumName: data.albumName,
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

  return { lyrics, state, error, discoveredLyrics, searchResults, refetch: fetchLyrics };
}
