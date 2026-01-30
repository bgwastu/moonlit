"use client";

import { useCallback, useEffect, useState } from "react";
import { LyricsSearchRecord } from "@/lib/lyrics";

const LRCLIB_BASE = "https://lrclib.net/api";
const USER_AGENT = "Moonlit (https://github.com/bgwastu/moonlit)";

export type LyricsSearchState = "idle" | "loading" | "ready" | "error";

export interface UseLyricsSearchOptions {
  /** Search in any field (track title, artist, album). At least one of q or track_name required. */
  q?: string;
  /** Search in track title. At least one of q or track_name required. */
  track_name?: string;
  /** Filter by artist name */
  artist_name?: string;
  /** Filter by album name */
  album_name?: string;
  /** If true, run search on mount when params are valid */
  enabled?: boolean;
}

export interface UseLyricsSearchReturn {
  results: LyricsSearchRecord[];
  state: LyricsSearchState;
  error: string | null;
  search: (params: {
    q?: string;
    track_name?: string;
    artist_name?: string;
    album_name?: string;
  }) => Promise<void>;
}

function buildSearchParams(params: {
  q?: string;
  track_name?: string;
  artist_name?: string;
  album_name?: string;
}): URLSearchParams | null {
  const { q, track_name, artist_name, album_name } = params;
  if (!q?.trim() && !track_name?.trim()) return null;
  const sp = new URLSearchParams();
  if (q?.trim()) sp.set("q", q.trim());
  if (track_name?.trim()) sp.set("track_name", track_name.trim());
  if (artist_name?.trim()) sp.set("artist_name", artist_name.trim());
  if (album_name?.trim()) sp.set("album_name", album_name.trim());
  return sp;
}

export function useLyricsSearch(
  options: UseLyricsSearchOptions = {},
): UseLyricsSearchReturn {
  const { q, track_name, artist_name, album_name, enabled = false } = options;
  const [results, setResults] = useState<LyricsSearchRecord[]>([]);
  const [state, setState] = useState<LyricsSearchState>("idle");
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (params: {
      q?: string;
      track_name?: string;
      artist_name?: string;
      album_name?: string;
    }) => {
      const sp = buildSearchParams(params);
      if (!sp) {
        setResults([]);
        setState("idle");
        setError(null);
        return;
      }
      setState("loading");
      setError(null);
      try {
        const res = await fetch(`${LRCLIB_BASE}/search?${sp}`, {
          headers: { "Lrclib-Client": USER_AGENT },
        });
        if (!res.ok) throw new Error(`LRCLib ${res.status}`);
        const data = (await res.json()) as LyricsSearchRecord[];
        setResults(Array.isArray(data) ? data : []);
        setState("ready");
      } catch (e) {
        setResults([]);
        setState("error");
        setError(e instanceof Error ? e.message : "Search failed");
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;
    const sp = buildSearchParams({ q, track_name, artist_name, album_name });
    if (sp) search({ q, track_name, artist_name, album_name });
  }, [enabled, q, track_name, artist_name, album_name, search]);

  return { results, state, error, search };
}
