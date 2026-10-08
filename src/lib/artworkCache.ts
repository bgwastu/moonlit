import {
  MAX_CACHED_COVERS,
  MAX_CACHED_COVER_BYTES,
  MAX_HISTORY_ITEMS,
} from "@/lib/constants";
import { isWeakYtimgCoverUrl, upgradeCoverUrl } from "@/lib/coverUrl";
import { getYouTubeId } from "@/utils";

const META_KEY = "__moonlit-cover-cache-meta__";
const RETRY_AFTER_MS = 30_000;

interface ArtworkStore {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

interface CacheMeta {
  order: string[];
  sizes: Record<string, number>;
  savedTracks: string[];
}

interface Cover {
  key: string;
  coverUrl: string;
  blob: Blob;
}

function trackIdentity(sourceUrl: string): string {
  const id = getYouTubeId(sourceUrl) || sourceUrl.replace(/^youtube:/, "");
  return /^[\w-]{11}$/.test(id) ? `youtube:${id}` : sourceUrl;
}

function coverIdentity(raw: string): string {
  try {
    const proxy = new URL(raw, "https://moonlit.invalid");
    if (proxy.pathname === "/api/cover") raw = proxy.searchParams.get("url") || raw;
    const image = new URL(upgradeCoverUrl(raw));
    // Thumbnail query strings and the proxy's recovery id do not change this image.
    if (/\.ytimg\.com$/.test(image.hostname) && /^\/vi\/[\w-]{11}\//.test(image.pathname))
      image.search = "";
    image.hash = "";
    return image.toString();
  } catch {
    return raw;
  }
}

function keyTrack(key: string): string {
  return trackIdentity(key.split("\n")[0]);
}

function canReuse(cover: Cover, next: string): boolean {
  // Keep saved art when metadata changes. Upgrade a video thumbnail to album art once.
  return (
    !next ||
    cover.coverUrl === next ||
    !isWeakYtimgCoverUrl(cover.coverUrl) ||
    isWeakYtimgCoverUrl(next)
  );
}

async function validateImage(blob: Blob): Promise<boolean> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    image.src = url;
    return await Promise.race([
      image
        .decode()
        .then(() => image.naturalWidth > 0 && image.naturalHeight > 0)
        .catch(() => false),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    URL.revokeObjectURL(url);
  }
}

/** Shared persistent artwork loading; consumers receive blobs and own their display URLs. */
export function createArtworkCache({
  store,
  fetcher = (url, init) => fetch(url, init),
  validate = validateImage,
  now = Date.now,
  maxEntries = MAX_CACHED_COVERS,
  maxBytes = MAX_CACHED_COVER_BYTES,
  maxSavedTracks = MAX_HISTORY_ITEMS,
}: {
  store: ArtworkStore;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  validate?: (blob: Blob) => Promise<boolean>;
  now?: () => number;
  maxEntries?: number;
  maxBytes?: number;
  maxSavedTracks?: number;
}) {
  const requests = new Map<string, { result: Promise<Cover | null>; saved: boolean }>();
  const failures = new Map<string, number>();
  const controllers = new Set<AbortController>();
  let generation = 0;
  let storageWork: Promise<unknown> = Promise.resolve();

  const withLock = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request(name, work);
    return work();
  };

  // Serialize metadata changes so simultaneously mounting rows cannot lose LRU entries.
  const withStore = <T>(work: () => Promise<T>): Promise<T> => {
    const result = storageWork.then(() => withLock("moonlit-artwork-storage", work));
    storageWork = result.catch(() => {});
    return result;
  };

  async function readMeta(): Promise<CacheMeta> {
    const old = await store.getItem<Partial<CacheMeta>>(META_KEY);
    const meta: CacheMeta = {
      order: old?.order || [],
      sizes: old?.sizes || {},
      savedTracks: old?.savedTracks || [],
    };
    // Existing devices have blobs and an order list from the previous cache format.
    for (const key of meta.order) {
      if (meta.sizes[key] !== undefined) continue;
      const blob = await store.getItem<Blob>(key);
      meta.sizes[key] = blob instanceof Blob ? blob.size : 0;
    }
    return meta;
  }

  async function saveMeta(meta: CacheMeta): Promise<void> {
    let bytes = meta.order.reduce((total, key) => total + (meta.sizes[key] || 0), 0);
    const saved = new Set(meta.savedTracks);
    while (meta.order.length > maxEntries || bytes > maxBytes) {
      const evict =
        [...meta.order].reverse().find((key) => !saved.has(keyTrack(key))) ||
        meta.order.at(-1);
      if (!evict) break;
      meta.order = meta.order.filter((key) => key !== evict);
      bytes -= meta.sizes[evict] || 0;
      delete meta.sizes[evict];
      await store.removeItem(evict);
    }
    await store.setItem(META_KEY, meta);
  }

  function touch(meta: CacheMeta, cover: Cover, saved: boolean) {
    meta.order = [cover.key, ...meta.order.filter((key) => key !== cover.key)];
    meta.sizes[cover.key] = cover.blob.size;
    if (saved) {
      const track = keyTrack(cover.key);
      meta.savedTracks = [
        track,
        ...meta.savedTracks.filter((key) => key !== track),
      ].slice(0, maxSavedTracks);
    }
  }

  async function readCached(track: string, next: string): Promise<Cover | null> {
    let covers: Cover[];
    try {
      covers = await withStore(async () => {
        const meta = await readMeta();
        const keys = meta.order.filter((key) => keyTrack(key) === track);
        const exact = `${track}\n${next}`;
        keys.sort(
          (a, b) =>
            Number(b === exact || coverIdentity(b.split("\n")[1]) === next) -
            Number(a === exact || coverIdentity(a.split("\n")[1]) === next),
        );
        const found: Cover[] = [];
        for (const key of keys) {
          const blob = await store.getItem<Blob>(key);
          if (blob instanceof Blob && blob.size && blob.type.startsWith("image/"))
            found.push({ key, blob, coverUrl: coverIdentity(key.split("\n")[1]) });
        }
        return found;
      });
    } catch {
      return null;
    }
    for (const cover of covers) {
      if (await validate(cover.blob)) return cover;
      // A corrupt old cache entry must not poison all future opens of this song.
      await withStore(async () => {
        await store.removeItem(cover.key);
        const meta = await readMeta();
        meta.order = meta.order.filter((key) => key !== cover.key);
        delete meta.sizes[cover.key];
        await saveMeta(meta);
      }).catch(() => {});
    }
    return null;
  }

  async function persist(cover: Cover, saved: boolean, epoch: number): Promise<void> {
    if (cover.blob.size > maxBytes) return;
    await withStore(async () => {
      if (epoch !== generation) return;
      const meta = await readMeta();
      await store.setItem(cover.key, cover.blob);
      // One best image per track, including migration from URL-based legacy keys.
      for (const key of meta.order) {
        if (key !== cover.key && keyTrack(key) === keyTrack(cover.key)) {
          await store.removeItem(key);
          delete meta.sizes[key];
        }
      }
      meta.order = meta.order.filter(
        (key) => key === cover.key || keyTrack(key) !== keyTrack(cover.key),
      );
      touch(meta, cover, saved);
      await saveMeta(meta);
    }).catch(() => {});
  }

  async function resolve(
    track: string,
    url: string,
    epoch: number,
    saved: () => boolean,
  ): Promise<Cover | null> {
    const next = coverIdentity(url);
    const cached = await readCached(track, next);
    if (epoch !== generation) return null;
    if (cached && canReuse(cached, next)) return cached;
    const key = `${track}\n${next}`;
    if (!url || (failures.get(key) || 0) > now()) return cached;
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(url, {
        cache: "force-cache",
        signal: controller.signal,
      });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size && blob.type.startsWith("image/") && (await validate(blob))) {
          if (epoch !== generation) return null;
          const cover = { key, coverUrl: next, blob };
          await persist(cover, saved(), epoch);
          failures.delete(key);
          return cover;
        }
      }
    } catch {
      /* Keep existing artwork or the designed fallback. */
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
    if (epoch !== generation) return null;
    failures.set(key, now() + RETRY_AFTER_MS);
    while (failures.size > maxEntries) failures.delete(failures.keys().next().value!);
    return cached;
  }

  return {
    async load(
      sourceUrl: string,
      coverUrl: string,
      { saved = false, cacheOnly = false }: { saved?: boolean; cacheOnly?: boolean } = {},
    ): Promise<Blob | null> {
      const track = trackIdentity(sourceUrl) || `image:${coverIdentity(coverUrl)}`;
      const epoch = generation;
      // Local mode may display saved artwork, but must not contact image CDNs.
      if (cacheOnly && !/^(blob:|data:)/.test(coverUrl)) {
        const cover = await readCached(track, coverIdentity(coverUrl));
        return epoch === generation ? cover?.blob || null : null;
      }
      let request = requests.get(track);
      if (request && saved) request.saved = true;
      let cover = request ? await request.result : null;
      if (epoch !== generation) return null;
      if (!cover || !canReuse(cover, coverIdentity(coverUrl))) {
        request = requests.get(track);
        if (!request) {
          const current = { saved, result: null as Promise<Cover | null> };
          // A second tab rechecks persisted artwork after the first tab finishes.
          current.result = withLock(`moonlit-artwork-load:${track}`, () =>
            resolve(track, coverUrl, epoch, () => current.saved),
          );
          requests.set(track, current);
          request = current;
          void current.result
            .finally(() => {
              if (requests.get(track) === current) requests.delete(track);
            })
            .catch(() => {});
        }
        if (saved) request.saved = true;
        cover = await request.result;
      }
      if (!cover || epoch !== generation) return null;
      await withStore(async () => {
        if (epoch !== generation) return;
        const meta = await readMeta();
        if (!meta.order.includes(cover.key)) return;
        touch(meta, cover, saved);
        await saveMeta(meta);
      }).catch(() => {});
      return cover.blob;
    },
    async clear(): Promise<void> {
      generation++;
      for (const controller of controllers) controller.abort();
      requests.clear();
      failures.clear();
      await withStore(() => store.clear());
    },
  };
}
