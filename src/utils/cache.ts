import localforage from "localforage";

const mediaStore = localforage.createInstance({
  name: "moonlit",
  storeName: "media-cache",
});

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
  try {
    await mediaStore.setItem(key, blob);
  } catch (e) {
    console.error("Failed to cache media:", e);
  }
}

export async function removeMediaCache(key: string): Promise<void> {
  try {
    await mediaStore.removeItem(key);
  } catch (e) {
    console.error("Failed to remove media from cache:", e);
  }
}
