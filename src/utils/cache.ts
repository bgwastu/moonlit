import localforage from "localforage";
import { MAX_CACHED_TRACKS } from "@/lib/constants";

export { MAX_CACHED_TRACKS };

const META_KEY = "__moonlit-cache-meta__";

const mediaStore = localforage.createInstance({
  name: "moonlit",
  storeName: "media-cache",
});

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

export async function touchMediaCache(key: string): Promise<void> {
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

export async function removeMediaCache(key: string): Promise<void> {
  try {
    await mediaStore.removeItem(key);
    const meta = await getMeta();
    meta.order = meta.order.filter((entry) => entry !== key);
    await saveMeta(meta);
  } catch (e) {
    console.error("Failed to remove media from cache:", e);
  }
}

export async function clearMediaCache(): Promise<void> {
  try {
    await mediaStore.clear();
  } catch (e) {
    console.error("Failed to clear media cache:", e);
  }
}
