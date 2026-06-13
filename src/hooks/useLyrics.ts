"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Lyric,
  LyricsSearchRecord,
  parseLRC,
  sortLyricsSearchRecordsForTrack,
  stripVideoTitleFiller,
} from "@/lib/lyrics";

const LRCLIB_BASE = "https://lrclib.net/api";
const USER_AGENT = "Moonlit (https://github.com/bgwastu/moonlit)";

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
  selectedSyncedLyrics?: string | null;
  offsetSeconds?: number;
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

// --- In-memory session cache ---
interface CachedLyrics {
  lyrics: Lyric[];
  discovered: DiscoveredLyrics | null;
  searchResults: LyricsSearchRecord[];
}

const lyricsCache = new Map<string, CachedLyrics>();

function cacheKey(track: string, artist: string, duration: number): string {
  return `${track}||${artist}||${duration}`;
}

function setCached(key: string, data: CachedLyrics): void {
  lyricsCache.set(key, data);
}

function getCached(key: string): CachedLyrics | undefined {
  return lyricsCache.get(key);
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "Lrclib-Client": USER_AGENT },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
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
  const trackRef = useRef({ trackName, artistName, durationSeconds });

  useEffect(() => {
    trackRef.current = { trackName, artistName, durationSeconds };
  }, [trackName, artistName, durationSeconds]);

  const fetchLyrics = useCallback(
    async (signal?: AbortSignal) => {
      const { trackName: t, artistName: a, durationSeconds: d } = trackRef.current;
      const titleForLyrics = stripVideoTitleFiller(t) || t.trim();

      if (!titleForLyrics || !a?.trim() || d <= 0) {
        setLyrics([]);
        setState("idle");
        setDiscoveredLyrics(null);
        setSearchResults([]);
        return;
      }

      const cacheK = cacheKey(titleForLyrics, a.trim(), d);
      const cached = getCached(cacheK);
      if (cached) {
        setLyrics(cached.lyrics);
        setDiscoveredLyrics(cached.discovered);
        setSearchResults(cached.searchResults);
        setState(cached.lyrics.length > 0 ? "ready" : "not_found");
        return;
      }

      setState("loading");
      setError(null);

      // Fire both GET-cached and search in parallel
      const getParams = new URLSearchParams({
        track_name: titleForLyrics,
        artist_name: a.trim(),
        album_name: "",
        duration: String(Math.round(d)),
      });

      const searchParams = new URLSearchParams({
        track_name: titleForLyrics,
        artist_name: a.trim(),
      });

      const getUrl = `${LRCLIB_BASE}/get-cached?${getParams}`;
      const searchUrl = `${LRCLIB_BASE}/search?${searchParams}`;

      const searchPromise = fetchJson<LyricsSearchRecord[]>(searchUrl, signal);

      // Try GET-cached first (fast, no external lookups)
      const getData = await fetchJson<LrclibResponse>(getUrl, signal);
      if (signal?.aborted) return;

      if (getData?.syncedLyrics?.trim() && durationMatches(d, getData.duration ?? 0)) {
        const parsed = parseLRC(getData.syncedLyrics, (getData.duration ?? d) * 1000);
        const finalLyrics = applyOffset(parsed, offsetMs);
        const discovered: DiscoveredLyrics | null =
          parsed.length > 0 && getData.id
            ? {
                id: getData.id,
                trackName: getData.trackName ?? titleForLyrics,
                artistName: getData.artistName ?? a.trim(),
                albumName: getData.albumName,
                syncedLyrics: getData.syncedLyrics,
              }
            : null;

        // Await search for pre-populating the manual modal (background)
        const searchData = await searchPromise;
        const results = Array.isArray(searchData) ? searchData : [];

        setLyrics(finalLyrics);
        setDiscoveredLyrics(discovered);
        setSearchResults(results);
        setState(parsed.length > 0 ? "ready" : "not_found");

        setCached(cacheK, { lyrics: finalLyrics, discovered, searchResults: results });
        return;
      }

      // GET-cached missed — try GET (may access external sources)
      const getUrlUncached = `${LRCLIB_BASE}/get?${getParams}`;
      const getDataUncached = await fetchJson<LrclibResponse>(getUrlUncached, signal);
      if (signal?.aborted) return;

      if (
        getDataUncached?.syncedLyrics?.trim() &&
        durationMatches(d, getDataUncached.duration ?? 0)
      ) {
        const parsed = parseLRC(
          getDataUncached.syncedLyrics,
          (getDataUncached.duration ?? d) * 1000,
        );
        const finalLyrics = applyOffset(parsed, offsetMs);
        const discovered: DiscoveredLyrics | null =
          parsed.length > 0 && getDataUncached.id
            ? {
                id: getDataUncached.id,
                trackName: getDataUncached.trackName ?? titleForLyrics,
                artistName: getDataUncached.artistName ?? a.trim(),
                albumName: getDataUncached.albumName,
                syncedLyrics: getDataUncached.syncedLyrics,
              }
            : null;

        const searchData = await searchPromise;
        const results = Array.isArray(searchData) ? searchData : [];

        setLyrics(finalLyrics);
        setDiscoveredLyrics(discovered);
        setSearchResults(results);
        setState(parsed.length > 0 ? "ready" : "not_found");

        setCached(cacheK, { lyrics: finalLyrics, discovered, searchResults: results });
        return;
      }

      // No direct match — use search results
      const searchData = await searchPromise;
      const records = Array.isArray(searchData) ? searchData : [];
      setSearchResults(records);

      const ranked = sortLyricsSearchRecordsForTrack(records, d);
      const best = ranked[0];
      const bestSynced = best?.syncedLyrics?.trim();

      if (best && bestSynced) {
        const parsed = parseLRC(bestSynced, (best.duration ?? d) * 1000);
        const finalLyrics = applyOffset(parsed, offsetMs);
        const discovered: DiscoveredLyrics | null =
          parsed.length > 0
            ? {
                id: best.id,
                trackName: best.trackName,
                artistName: best.artistName,
                albumName: best.albumName,
                syncedLyrics: bestSynced,
              }
            : null;

        setLyrics(finalLyrics);
        setDiscoveredLyrics(discovered);
        setState("ready");

        setCached(cacheK, { lyrics: finalLyrics, discovered, searchResults: records });
        return;
      }

      // Nothing found
      setLyrics([]);
      setDiscoveredLyrics(null);
      setState("not_found");
      setCached(cacheK, { lyrics: [], discovered: null, searchResults: records });
    },
    [offsetMs],
  );

  // Main effect: pre-fetch lyrics immediately when enabled
  useEffect(() => {
    if (!enabled) return;

    if (selectedSyncedLyrics) {
      const parsed = parseLRC(selectedSyncedLyrics, durationSeconds * 1000);
      queueMicrotask(() => {
        setLyrics(applyOffset(parsed, offsetMs));
        setState(parsed.length > 0 ? "ready" : "not_found");
      });
      return;
    }

    const controller = new AbortController();
    fetchLyrics(controller.signal);
    return () => controller.abort();
  }, [enabled, selectedSyncedLyrics, durationSeconds, offsetMs, fetchLyrics]);

  return { lyrics, state, error, discoveredLyrics, searchResults };
}
