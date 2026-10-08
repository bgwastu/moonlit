"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LyricsSearchRecord } from "@/lib/lyrics";
import { type LyricsSearchTrack, rankLyricsSearchResults } from "@/lib/lyricsSearch";

const SEARCH_URL = "https://lrclib.net/api/search";
const CACHE_LIMIT = 25;
const cache = new Map<string, unknown>();

interface SearchState {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  records: unknown;
}

interface LyricsSearchOptions {
  enabled: boolean;
  initialQuery: string;
  initialResults: LyricsSearchRecord[];
  track: LyricsSearchTrack;
}

export function useLyricsSearch({
  enabled,
  initialQuery,
  initialResults,
  track,
}: LyricsSearchOptions) {
  const [query, setQuery] = useState(initialQuery);
  const [attempt, setAttempt] = useState(0);
  const immediateQueryRef = useRef<string | null>(null);
  const [request, setRequest] = useState<SearchState>(() => ({
    query: initialResults.length ? initialQuery.trim() : "",
    status: initialResults.length ? "ready" : "idle",
    records: initialResults,
  }));
  const term = query.trim().replace(/\s+/g, " ");

  useEffect(() => {
    if (!enabled || !term) return;
    const controller = new AbortController();
    const cacheKey = term.toLocaleLowerCase();
    const seed =
      attempt === 0 && term === initialQuery.trim() && initialResults.length
        ? initialResults
        : cache.get(cacheKey);
    if (seed) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) {
          setRequest({ query: term, status: "ready", records: seed });
        }
      });
      return () => controller.abort();
    }

    const delay = immediateQueryRef.current === term ? 0 : 300;
    immediateQueryRef.current = null;
    const timer = window.setTimeout(async () => {
      setRequest((previous) => ({ ...previous, query: term, status: "loading" }));
      try {
        const response = await fetch(
          `${SEARCH_URL}?${new URLSearchParams({ q: term })}`,
          {
            headers: { "Lrclib-Client": "Moonlit (https://github.com/bgwastu/moonlit)" },
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Lyrics search failed");
        const records: unknown = await response.json();
        if (!Array.isArray(records)) throw new Error("Invalid search response");
        if (controller.signal.aborted) return;
        cache.delete(cacheKey);
        cache.set(cacheKey, records);
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        setRequest({ query: term, status: "ready", records });
      } catch {
        if (controller.signal.aborted) return;
        setRequest({ query: term, status: "error", records: [] });
      }
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, term, initialQuery, initialResults, attempt]);

  const searchNow = useCallback(() => {
    if (!term) return;
    cache.delete(term.toLocaleLowerCase());
    immediateQueryRef.current = term;
    setAttempt((previous) => previous + 1);
  }, [term]);

  const status = !term ? "idle" : request.query === term ? request.status : "loading";
  const results = useMemo(
    () => (term ? rankLyricsSearchResults(request.records, track) : []),
    [term, request.records, track],
  );

  return { query, setQuery, results, status, searchNow };
}
