import localforage from "localforage";
import { MAX_CACHED_TRACKS } from "@/lib/constants";

const META_KEY = "__moonlit-cache-meta__";

const mediaStore = localforage.createInstance({
  name: "moonlit",
  storeName: "media-cache",
});

const coverStore = localforage.createInstance({
  name: "moonlit",
  storeName: "cover-cache",
});
const COVER_META_KEY = "__moonlit-cover-cache-meta__";

interface CacheMeta {
  order: string[];
}

async function getMeta(): Promise<CacheMeta> {
  try {
    return (await mediaStore.getItem<CacheMeta>(META_KEY)) ?? { order: [] };
  } catch {
    return { order: [] };
  }
}

async function saveMeta(meta: CacheMeta): Promise<void> {
  try {
    await mediaStore.setItem(META_KEY, meta);
  } catch (e) {
    console.error("Failed to save media cache meta:", e);
  }
}

export async function getMedia(key: string): Promise<Blob | null> {
  try {
    const value = await mediaStore.getItem<Blob>(key);
    return value ?? null;
  } catch (e) {
    console.error("Failed to get media from cache:", e);
    return null;
  }
}

export async function setMediaCache(key: string, blob: Blob): Promise<void> {
  await setMediaCacheWithLimit(key, blob);
}

export async function setMediaCacheWithLimit(key: string, blob: Blob): Promise<void> {
  try {
    await mediaStore.setItem(key, blob);
    const meta = await getMeta();
    meta.order = [key, ...meta.order.filter((entry) => entry !== key)];

    while (meta.order.length > MAX_CACHED_TRACKS) {
      const evict = meta.order.pop();
      if (evict && evict !== META_KEY) {
        await mediaStore.removeItem(evict);
      }
    }

    await saveMeta(meta);
  } catch (e) {
    console.error("Failed to cache media:", e);
  }
}

async function touchMediaCache(key: string): Promise<void> {
  try {
    const exists = await mediaStore.getItem(key);
    if (!exists) return;
    const meta = await getMeta();
    meta.order = [key, ...meta.order.filter((entry) => entry !== key)];
    await saveMeta(meta);
  } catch (e) {
    console.error("Failed to touch media cache:", e);
  }
}

export async function getCachedMediaUrl(sourceUrl: string): Promise<string | null> {
  const blob = await getMedia(sourceUrl);
  if (!blob) return null;
  await touchMediaCache(sourceUrl);
  return URL.createObjectURL(blob);
}

/** True when IndexedDB already holds audio for this source (offline replay). */
export async function hasCachedMedia(sourceUrl: string): Promise<boolean> {
  if (!sourceUrl) return false;
  try {
    const value = await mediaStore.getItem(sourceUrl);
    return value != null && sourceUrl !== META_KEY;
  } catch {
    return false;
  }
}

function coverCacheKey(sourceUrl: string, coverUrl: string): string {
  return `${sourceUrl}\n${coverUrl}`;
}

/** Return a local object URL for a previously loaded track cover. */
export async function getCachedCoverUrl(
  sourceUrl: string,
  coverUrl: string,
): Promise<string | null> {
  if (!sourceUrl || !coverUrl) return null;
  try {
    const key = coverCacheKey(sourceUrl, coverUrl);
    const blob = await coverStore.getItem<Blob>(key);
    if (blob) {
      const meta = (await coverStore.getItem<CacheMeta>(COVER_META_KEY)) ?? { order: [] };
      meta.order = [key, ...meta.order.filter((entry) => entry !== key)];
      await coverStore.setItem(COVER_META_KEY, meta);
    }
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

/** Persist a cover independently from audio so offline replay does not hit the server. */
export async function setCoverCache(
  sourceUrl: string,
  coverUrl: string,
  blob: Blob,
): Promise<void> {
  if (!sourceUrl || !coverUrl || !blob.size) return;
  try {
    const key = coverCacheKey(sourceUrl, coverUrl);
    await coverStore.setItem(key, blob);
    const meta = (await coverStore.getItem<CacheMeta>(COVER_META_KEY)) ?? { order: [] };
    meta.order = [key, ...meta.order.filter((entry) => entry !== key)];
    while (meta.order.length > MAX_CACHED_TRACKS) {
      const evict = meta.order.pop();
      if (evict) await coverStore.removeItem(evict);
    }
    await coverStore.setItem(COVER_META_KEY, meta);
  } catch (e) {
    console.error("Failed to cache cover:", e);
  }
}

export async function clearMediaCache(): Promise<void> {
  try {
    await mediaStore.clear();
    await coverStore.clear();
  } catch (e) {
    console.error("Failed to clear media cache:", e);
  }
}
