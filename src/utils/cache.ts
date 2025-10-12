import localforage from "localforage";

const store = localforage.createInstance({ name: "moonlit", storeName: "media" });

export async function getMedia(key: string): Promise<Blob | null> {
  const value = await store.getItem<Blob>(key);
  return value ?? null;
}

export async function setMedia(key: string, blob: Blob): Promise<void> {
  await store.setItem(key, blob);
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const value = await store.getItem<T>(`meta:${key}`);
  return value ?? null;
}

export async function setMeta<T = unknown>(key: string, data: T): Promise<void> {
  await store.setItem(`meta:${key}`, data as any);
}
