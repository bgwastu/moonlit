import localforage from "localforage";
import { createArtworkCache } from "@/lib/artworkCache";
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
const artworkCache = createArtworkCache({ store: coverStore });

export const loadCachedCover = artworkCache.load;
export const MEDIA_CACHE_CHANGED_EVENT = "moonlit:media-cache-changed";

function notifyMediaCacheChanged() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(MEDIA_CACHE_CHANGED_EVENT));
}

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
    notifyMediaCacheChanged();
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
    return value instanceof Blob && value.size > 0 && sourceUrl !== META_KEY;
  } catch {
    return false;
  }
}

/** Only files actually present on this device belong in the local-music library. */
export async function getAvailableMediaSources(): Promise<string[]> {
  try {
    const keys = (await mediaStore.keys()).filter((key) => key !== META_KEY);
    const available = await Promise.all(
      keys.map(async (key) => ((await hasCachedMedia(key)) ? key : null)),
    );
    return available.filter((key): key is string => key !== null);
  } catch {
    return [];
  }
}

export async function clearMediaCache(): Promise<void> {
  try {
    await mediaStore.clear();
    await artworkCache.clear();
    notifyMediaCacheChanged();
  } catch (e) {
    console.error("Failed to clear media cache:", e);
  }
}
