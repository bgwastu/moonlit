import type { Media } from "@/interfaces";

const STORAGE_PREFIX = "moonlit-search-meta:";

/** Survives sessionStorage consumption (Strict Mode remounts, cache hits after restore). */
const memoryCache = new Map<string, Partial<Media["metadata"]>>();

function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

function readSessionStorage(id: string): Partial<Media["metadata"]> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(storageKey(id));
    if (!raw) return undefined;
    return JSON.parse(raw) as Partial<Media["metadata"]>;
  } catch {
    return undefined;
  }
}

/** Stash metadata for a track id (session restore, search results, history replay). */
export function stashSearchMeta(id: string, meta: Partial<Media["metadata"]>): void {
  if (!id) return;
  memoryCache.set(id, { ...memoryCache.get(id), ...meta });
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(id), JSON.stringify(meta));
  } catch {
    // sessionStorage may be full or unavailable
  }
}

/** Read metadata without removing it from sessionStorage. */
export function peekSearchMeta(id: string): Partial<Media["metadata"]> | undefined {
  if (!id) return undefined;
  const fromSession = readSessionStorage(id);
  if (fromSession) {
    memoryCache.set(id, { ...memoryCache.get(id), ...fromSession });
    return fromSession;
  }
  return memoryCache.get(id);
}

/**
 * Read metadata and move it into the in-memory cache (one-time sessionStorage consume).
 * Used when the player shell first mounts for a URL.
 */
export function consumeSearchMeta(id: string): Partial<Media["metadata"]> | undefined {
  const meta = peekSearchMeta(id);
  if (!meta) return undefined;
  memoryCache.set(id, { ...memoryCache.get(id), ...meta });
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(storageKey(id));
    } catch {
      // ignore
    }
  }
  return meta;
}

const PLACEHOLDER = new Set(["", "Unknown"]);

export function isKnownMetaValue(value: string | undefined | null): value is string {
  return !!value && !PLACEHOLDER.has(value);
}

function isKnown(value: string | undefined | null): value is string {
  return isKnownMetaValue(value);
}

/** YouTube page thumbs (hqdefault etc.) — prefer music/search covers over these. */
export function isWeakCoverUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // keep raw
  }
  return /i\.ytimg\.com\/vi\/[^/?#]+\/(default|mqdefault|hqdefault|sddefault|hq720)\.jpg/i.test(
    decoded,
  );
}

function pickCover(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (!candidate) return current;
  if (!current || isWeakCoverUrl(current)) {
    if (!isWeakCoverUrl(candidate) || !current) return candidate;
  }
  return current;
}

/** Prefer real titles/authors from earlier sources over cache/extract placeholders. */
export function mergeTrackMetadata(
  primary: Partial<Media["metadata"]> | undefined,
  ...fallbacks: Array<Partial<Media["metadata"]> | undefined>
): Media["metadata"] {
  const merged: Partial<Media["metadata"]> = { ...primary };
  for (const fb of fallbacks) {
    if (!fb) continue;
    if (!isKnown(merged.title) && isKnown(fb.title)) merged.title = fb.title;
    if (!isKnown(merged.author) && isKnown(fb.author)) merged.author = fb.author;
    if (merged.artist == null && fb.artist != null) merged.artist = fb.artist;
    if (merged.album == null && fb.album != null) merged.album = fb.album;
    merged.coverUrl = pickCover(merged.coverUrl, fb.coverUrl);
    if (merged.id == null && fb.id != null) merged.id = fb.id;
  }

  return {
    id: merged.id ?? null,
    title: merged.title || "Unknown",
    author: merged.author || "Unknown",
    ...(merged.artist != null && { artist: merged.artist }),
    ...(merged.album != null && { album: merged.album }),
    coverUrl: merged.coverUrl || "",
  };
}
