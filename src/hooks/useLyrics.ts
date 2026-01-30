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
}

interface UseLyricsReturn {
  lyrics: Lyric[];
  state: LyricsState;
  error: string | null;
  refetch: () => void;
}

export function useLyrics({
  trackName,
  artistName,
  durationSeconds,
  enabled,
}: UseLyricsOptions): UseLyricsReturn {
  const [lyrics, setLyrics] = useState<Lyric[]>([]);
  const [state, setState] = useState<LyricsState>("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchLyrics = useCallback(async () => {
    if (!trackName?.trim() || !artistName?.trim() || durationSeconds <= 0) {
      setLyrics([]);
      setState("idle");
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
          return;
        }
        throw new Error(`LRCLib ${res.status}`);
      }
      const data: LrclibResponse = await res.json();
      const recordDuration = data.duration ?? 0;
      if (!durationMatches(durationSeconds, recordDuration)) {
        setLyrics([]);
        setState("not_found");
        return;
      }
      const synced = data.syncedLyrics?.trim();
      if (!synced) {
        setLyrics([]);
        setState("not_found");
        return;
      }
      const durationMs = recordDuration * 1000;
      const parsed = parseLRC(synced, durationMs);
      setLyrics(parsed);
      setState(parsed.length > 0 ? "ready" : "not_found");
    } catch (e) {
      setLyrics([]);
      setState("error");
      setError(e instanceof Error ? e.message : "Failed to load lyrics");
    }
  }, [trackName, artistName, durationSeconds]);

  useEffect(() => {
    if (!enabled) {
      setLyrics([]);
      setState("idle");
      setError(null);
      return;
    }
    fetchLyrics();
  }, [enabled, fetchLyrics]);

  return { lyrics, state, error, refetch: fetchLyrics };
}
