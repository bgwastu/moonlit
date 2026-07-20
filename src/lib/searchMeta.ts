import type { Media } from "@/interfaces";
import { isWeakYtimgCoverUrl, upgradeCoverUrl } from "@/lib/coverUrl";

const STORAGE_PREFIX = "moonlit-search-meta:";

/** In-memory mirror so Strict Mode remounts / restore still see stashed titles. */
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
  const next = { ...memoryCache.get(id), ...meta };
  if (next.coverUrl) next.coverUrl = upgradeCoverUrl(next.coverUrl);
  memoryCache.set(id, next);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(id), JSON.stringify(next));
  } catch {
    // sessionStorage may be full or unavailable
  }
}

/** Read metadata without removing it from sessionStorage. */
export function peekSearchMeta(id: string): Partial<Media["metadata"]> | undefined {
  if (!id) return undefined;
  const fromSession = readSessionStorage(id);
  if (fromSession) {
    if (fromSession.coverUrl) {
      fromSession.coverUrl = upgradeCoverUrl(fromSession.coverUrl);
    }
    memoryCache.set(id, { ...memoryCache.get(id), ...fromSession });
    return fromSession;
  }
  return memoryCache.get(id);
}

const PLACEHOLDER = new Set(["", "Unknown"]);

export function isKnownMetaValue(value: string | undefined | null): value is string {
  return !!value && !PLACEHOLDER.has(value);
}

function isKnown(value: string | undefined | null): value is string {
  return isKnownMetaValue(value);
}

/** YouTube page thumbs (hqdefault etc.) — prefer music/search covers over these. */
function isWeakCoverUrl(url: string | undefined | null): boolean {
  return isWeakYtimgCoverUrl(url);
}

function pickCover(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  const upgradedCandidate = candidate ? upgradeCoverUrl(candidate) : undefined;
  const upgradedCurrent = current ? upgradeCoverUrl(current) : undefined;
  if (!upgradedCandidate) return upgradedCurrent;
  if (!upgradedCurrent || isWeakCoverUrl(upgradedCurrent)) {
    if (!isWeakCoverUrl(upgradedCandidate) || !upgradedCurrent) return upgradedCandidate;
  }
  return upgradedCurrent;
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
