"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lyric } from "@/lib/lyrics";
import {
  EMPTY_ROMANIZATIONS,
  ROMANIZATION_VERSION,
  batchRomanizationLines,
  getMissingRomanizationLines,
} from "@/lib/romanization";

const MAX_CACHE_LINES = 2000;
const cache = new Map<string, string | null>();

interface RomanizationResult {
  key: string;
  romanizations: ReadonlyMap<string, string>;
  loading: boolean;
  error: string | null;
}

export function useRomanization({
  lyrics,
  enabled,
  trackKey,
}: {
  lyrics: Lyric[];
  enabled: boolean;
  trackKey: string;
}) {
  const { key: requestKey, hasLines } = useMemo(() => {
    const lines = getMissingRomanizationLines(lyrics);
    return { key: JSON.stringify([trackKey, lines]), hasLines: lines.length > 0 };
  }, [lyrics, trackKey]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<RomanizationResult>({
    key: "",
    romanizations: EMPTY_ROMANIZATIONS,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const [, lines] = JSON.parse(requestKey) as [string, string[]];
    const romanizations = new Map<string, string>();
    const missing: string[] = [];
    for (const line of lines) {
      const key = `${ROMANIZATION_VERSION}:${line}`;
      if (!cache.has(key)) {
        missing.push(line);
        continue;
      }
      const cached = cache.get(key)!;
      cache.delete(key);
      cache.set(key, cached);
      if (cached) romanizations.set(line, cached);
    }

    const publish = (loading: boolean, error: string | null = null) => {
      if (controller.signal.aborted) return;
      setResult({
        key: requestKey,
        romanizations: new Map(romanizations),
        loading,
        error,
      });
    };
    queueMicrotask(() => publish(missing.length > 0));

    if (missing.length > 0) {
      void (async () => {
        try {
          for (const batch of batchRomanizationLines(missing)) {
            if (controller.signal.aborted) return;
            const response = await fetch("/api/lyrics/romanize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lines: batch }),
              signal: controller.signal,
            });
            if (!response.ok)
              throw new Error(`Romanization request failed: ${response.status}`);
            const data = await response.json();
            if (controller.signal.aborted) return;
            if (
              !Array.isArray(data.romanizations) ||
              data.romanizations.length !== batch.length ||
              data.romanizations.some(
                (text: unknown) => text !== null && typeof text !== "string",
              )
            ) {
              throw new Error("Invalid romanization response");
            }
            batch.forEach((line, index) => {
              const text = data.romanizations[index]?.trim() || null;
              if (text) romanizations.set(line, text);
              cache.set(`${ROMANIZATION_VERSION}:${line}`, text);
              if (cache.size > MAX_CACHE_LINES) cache.delete(cache.keys().next().value!);
            });
          }
          publish(false);
        } catch {
          publish(false, "Couldn't load romanization. Please try again.");
        }
      })();
    }
    return () => controller.abort();
  }, [enabled, requestKey, attempt]);

  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);
  const active = enabled && result.key === requestKey;
  return {
    romanizations: active ? result.romanizations : EMPTY_ROMANIZATIONS,
    loading: enabled && hasLines && (!active || result.loading),
    error: active ? result.error : null,
    retry,
  };
}
