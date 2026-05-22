"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Lyric,
  LyricsSearchRecord,
  parseLRC,
  sortLyricsSearchRecordsForTrack,
  stripVideoTitleFiller,
} from "@/lib/lyrics";

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

interface DiscoveredLyrics {
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
    const titleForLyrics = stripVideoTitleFiller(trackName) || trackName.trim();

    if (!titleForLyrics || !artistName?.trim() || durationSeconds <= 0) {
      setLyrics([]);
      setState("idle");
      setDiscoveredLyrics(null);
      setSearchResults([]);
      return;
    }
    setState("loading");
    setError(null);

    const getParams = new URLSearchParams({
      track_name: titleForLyrics,
      artist_name: artistName.trim(),
      album_name: "",
      duration: String(Math.round(durationSeconds)),
    });

    const searchParams = new URLSearchParams({
      q: `${titleForLyrics} ${artistName.trim()}`,
      track_name: titleForLyrics,
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

      let searchRecords: LyricsSearchRecord[] = [];
      if (searchRes.status === "fulfilled" && searchRes.value.ok) {
        try {
          const searchData = (await searchRes.value.json()) as LyricsSearchRecord[];
          searchRecords = Array.isArray(searchData) ? searchData : [];
        } catch {
          searchRecords = [];
        }
      }
      setSearchResults(searchRecords);

      // -- Direct /get when duration and synced lyrics match --
      if (getRes.status === "fulfilled" && getRes.value.ok) {
        const data: LrclibResponse = await getRes.value.json();
        const recordDuration = data.duration ?? 0;
        const synced = data.syncedLyrics?.trim();
        if (synced && durationMatches(durationSeconds, recordDuration)) {
          const durationMs = recordDuration * 1000;
          const parsed = parseLRC(synced, durationMs);
          setLyrics(applyOffset(parsed, offsetMs));
          setState(parsed.length > 0 ? "ready" : "not_found");
          if (parsed.length > 0 && data.id) {
            setDiscoveredLyrics({
              id: data.id,
              trackName: data.trackName ?? titleForLyrics,
              artistName: data.artistName ?? artistName.trim(),
              albumName: data.albumName,
              syncedLyrics: synced,
            });
          } else {
            setDiscoveredLyrics(null);
          }
          return;
        }
      }

      // -- Fallback: auto-pick best search hit (same order as manual modal) --
      const ranked = sortLyricsSearchRecordsForTrack(searchRecords, durationSeconds);
      const best = ranked[0];
      const bestSynced = best?.syncedLyrics?.trim();
      if (best && bestSynced) {
        const recordDuration = best.duration ?? 0;
        const durationMs = Math.max(0, recordDuration) * 1000;
        const parsed = parseLRC(bestSynced, durationMs);
        setLyrics(applyOffset(parsed, offsetMs));
        setState(parsed.length > 0 ? "ready" : "not_found");
        if (parsed.length > 0) {
          setDiscoveredLyrics({
            id: best.id,
            trackName: best.trackName,
            artistName: best.artistName,
            albumName: best.albumName,
            syncedLyrics: bestSynced,
          });
        } else {
          setDiscoveredLyrics(null);
        }
        return;
      }

      setLyrics([]);
      setDiscoveredLyrics(null);
      if (getRes.status === "rejected") {
        throw new Error("Network error");
      }
      if (
        getRes.status === "fulfilled" &&
        !getRes.value.ok &&
        getRes.value.status !== 404
      ) {
        throw new Error(`LRCLib ${getRes.value.status}`);
      }
      setState("not_found");
    } catch (e) {
      setLyrics([]);
      setSearchResults([]);
      setState("error");
      setError(e instanceof Error ? e.message : "Failed to load lyrics");
      setDiscoveredLyrics(null);
    }
  }, [trackName, artistName, durationSeconds, offsetMs]);

  // Handle selected synced lyrics (user-selected override)
  useEffect(() => {
    let cancelled = false;
    const id = requestAnimationFrame(() => {
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

      if (!cancelled) void fetchLyrics();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [enabled, selectedSyncedLyrics, durationSeconds, offsetMs, fetchLyrics]);

  return { lyrics, state, error, discoveredLyrics, searchResults, refetch: fetchLyrics };
}
