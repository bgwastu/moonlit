import localforage from "localforage";

const store = localforage.createInstance({
  name: "moonlit",
  storeName: "media",
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});
const MEDIA_CACHE_INDEX_KEY = "meta:__media-cache-index";
const MAX_MEDIA_ITEMS = 20;
const MAX_MEDIA_BYTES = 750 * 1024 * 1024;

interface MediaCacheEntry {
  key: string;
  size: number;
  updatedAt: number;
}

store.ready().catch(() => {});

export async function getMedia(key: string): Promise<Blob | null> {
  try {
    const value = await store.getItem<Blob>(key);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setMedia(key: string, blob: Blob): Promise<void> {
  try {
    await store.setItem(key, blob);
    await updateMediaCacheIndex(key, blob.size);
  } catch {}
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  try {
    const value = await store.getItem<T>(`meta:${key}`);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function setMeta<T = unknown>(key: string, data: T): Promise<void> {
  try {
    await store.setItem(`meta:${key}`, data as any);
  } catch {}
}

async function updateMediaCacheIndex(key: string, size: number): Promise<void> {
  const index = await getMediaCacheIndex();
  const next = [
    ...index.filter((entry) => entry.key !== key),
    { key, size, updatedAt: Date.now() },
  ];
  await store.setItem(MEDIA_CACHE_INDEX_KEY, await evictOldMedia(next));
}

async function getMediaCacheIndex(): Promise<MediaCacheEntry[]> {
  const value = await store.getItem<MediaCacheEntry[]>(MEDIA_CACHE_INDEX_KEY);
  return Array.isArray(value) ? value : [];
}

async function evictOldMedia(entries: MediaCacheEntry[]): Promise<MediaCacheEntry[]> {
  const kept = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
  let totalBytes = kept.reduce((sum, entry) => sum + entry.size, 0);

  while (kept.length > MAX_MEDIA_ITEMS || totalBytes > MAX_MEDIA_BYTES) {
    const removed = kept.pop();
    if (!removed) break;
    totalBytes -= removed.size;
    await store.removeItem(removed.key).catch(() => {});
    await store.removeItem(`meta:${stripMediaVariant(removed.key)}`).catch(() => {});
  }

  return kept;
}

function stripMediaVariant(key: string): string {
  return key.replace(/:(audio|video)$/, "");
}
