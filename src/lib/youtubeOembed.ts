import type { Media } from "@/interfaces";
import { isKnownMetaValue, peekSearchMeta, stashSearchMeta } from "@/lib/searchMeta";

type OembedResponse = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

/** Fetch public YouTube oembed metadata (title / author / thumb). */
export async function fetchYouTubeOembedMeta(
  videoId: string,
  signal?: AbortSignal,
): Promise<Partial<Media["metadata"]> | null> {
  if (!videoId) return null;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;
  try {
    const res = await fetch(endpoint, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OembedResponse;
    if (!data.title && !data.author_name) return null;
    return {
      id: videoId,
      ...(data.title ? { title: data.title } : {}),
      ...(data.author_name ? { author: data.author_name } : {}),
      ...(data.thumbnail_url ? { coverUrl: data.thumbnail_url } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Stash oembed titles for a pasted / deep-linked YouTube id when the session
 * stash does not already have known title+author.
 */
export async function ensureYouTubeLinkMeta(
  videoId: string,
  options?: { timeoutMs?: number },
): Promise<Partial<Media["metadata"]> | undefined> {
  if (!videoId) return undefined;
  const existing = peekSearchMeta(videoId);
  if (isKnownMetaValue(existing?.title) && isKnownMetaValue(existing?.author)) {
    return existing;
  }

  const timeoutMs = options?.timeoutMs ?? 4000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const meta = await fetchYouTubeOembedMeta(videoId, controller.signal);
    if (!meta) return existing;
    stashSearchMeta(videoId, meta);
    return peekSearchMeta(videoId) ?? meta;
  } finally {
    clearTimeout(timer);
  }
}
