import localforage from "localforage";
import type { HistoryItem, LyricsSettings, Media } from "@/interfaces";
import { createArtworkCache } from "@/lib/artworkCache";
import { MAX_CACHED_TRACKS, MAX_HISTORY_ITEMS } from "@/lib/constants";
import { durableCoverUrl } from "@/lib/coverUrl";
import { getYouTubeId } from "@/utils";

const SHOW_VIDEO_KEY = "moonlit-show-video";
const PLAYBACK_PREFS_KEY = "moonlit-playback-prefs";
const HISTORY_KEY = "moonlit-history";
const SESSION_KEY = "moonlit-last-session";
const TRACK_PREFIX = "moonlit:video:";

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
  } catch (error) {
    console.error("Failed to save local music data:", error);
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export type GlobalPlaybackMode = "slowed" | "normal" | "speedup" | "custom";
export interface GlobalPlaybackPrefs {
  mode: GlobalPlaybackMode;
  rate: number;
  semitones: number;
  reverbAmount: number;
  isRepeat: boolean;
  volume: number;
  advancedStretch: boolean;
  showLyrics: boolean;
  showRomanization: boolean;
  slowedRate: number;
  normalRate: number;
  speedupRate: number;
  customRate: number;
  customSemitones: number;
}

export const DEFAULT_PLAYBACK_PREFS: GlobalPlaybackPrefs = {
  mode: "normal",
  rate: 1,
  semitones: 0,
  reverbAmount: 0,
  isRepeat: false,
  volume: 1,
  advancedStretch: false,
  showLyrics: false,
  showRomanization: false,
  slowedRate: 0.8,
  normalRate: 1,
  speedupRate: 1.25,
  customRate: 1,
  customSemitones: 0,
};

export function getShowVideo() {
  return read<number>(SHOW_VIDEO_KEY, 0) === 1;
}
export function setShowVideo(enabled: boolean) {
  write(SHOW_VIDEO_KEY, enabled ? 1 : 0);
}
export function getPlaybackPrefs(): GlobalPlaybackPrefs {
  const { showRomaji, ...stored } = read<
    Partial<GlobalPlaybackPrefs> & { showRomaji?: boolean }
  >(PLAYBACK_PREFS_KEY, {});
  return {
    ...DEFAULT_PLAYBACK_PREFS,
    ...stored,
    showRomanization: stored.showRomanization ?? showRomaji ?? false,
  };
}
export function savePlaybackPrefs(partial: Partial<GlobalPlaybackPrefs>) {
  write(PLAYBACK_PREFS_KEY, { ...getPlaybackPrefs(), ...partial });
}

function durableMetadata(
  metadata: Media["metadata"],
  sourceUrl: string,
): Media["metadata"] {
  return {
    ...metadata,
    coverUrl: durableCoverUrl(
      metadata?.coverUrl,
      getYouTubeId(sourceUrl) || metadata?.id,
    ),
  };
}
export function loadHistoryFromStorage(): HistoryItem[] {
  const history = read<HistoryItem[]>(HISTORY_KEY, []);
  return Array.isArray(history)
    ? history
        .filter((item) => typeof item?.sourceUrl === "string")
        .map((item) => ({
          ...item,
          metadata: durableMetadata(item.metadata, item.sourceUrl),
        }))
    : [];
}
export function saveHistoryToStorage(history: HistoryItem[]) {
  write(
    HISTORY_KEY,
    history.slice(0, MAX_HISTORY_ITEMS).map((item) => ({
      ...item,
      metadata: durableMetadata(item.metadata, item.sourceUrl),
    })),
  );
}
export function clearHistoryStorage() {
  remove(HISTORY_KEY);
}

export type LastSession = {
  savedAt: number;
  sourceUrl: string;
  metadata: Media["metadata"];
  mode: "mini" | "expanded";
  positionSeconds?: number;
};
function isRestorableUrl(url: string) {
  return /^https?:\/\//.test(url) || url.startsWith("/");
}
export function loadLastSession(): LastSession | null {
  const session = read<LastSession>(SESSION_KEY, null);
  if (!session) return null;
  if (
    typeof session.sourceUrl !== "string" ||
    !session.sourceUrl ||
    !session.savedAt ||
    Date.now() - session.savedAt > 3 * 86400000 ||
    !isRestorableUrl(session.sourceUrl)
  ) {
    remove(SESSION_KEY);
    return null;
  }
  return { ...session, metadata: durableMetadata(session.metadata, session.sourceUrl) };
}
export function saveLastSession(session: LastSession) {
  if (isRestorableUrl(session.sourceUrl))
    write(SESSION_KEY, {
      ...session,
      metadata: durableMetadata(session.metadata, session.sourceUrl),
    });
}
export function savePlaybackPosition(sourceUrl: string, positionSeconds: number) {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return;
  const existing = loadLastSession();
  if (existing?.sourceUrl === sourceUrl && existing.positionSeconds !== positionSeconds)
    saveLastSession({ ...existing, positionSeconds, savedAt: Date.now() });
}
export function clearLastSession() {
  remove(SESSION_KEY);
}

function lyricsKey(url: string) {
  const id = getYouTubeId(url);
  return TRACK_PREFIX + (id ? "yt:" + id : btoa(url).slice(0, 32));
}
/** Read lyrics from the existing per-track records; playback preferences are global. */
export function getLyricsSettings(url: string): LyricsSettings | null {
  try {
    return read<{ lyrics?: LyricsSettings }>(lyricsKey(url), {})?.lyrics ?? null;
  } catch {
    return null;
  }
}
export function saveLyricsSettings(url: string, lyrics: LyricsSettings | null) {
  if (!url) return;
  try {
    if (JSON.stringify(getLyricsSettings(url)) === JSON.stringify(lyrics)) return;
    write(lyricsKey(url), { lyrics, lastUpdated: Date.now() });
    const entries = Object.keys(localStorage)
      .filter((key) => key.startsWith(TRACK_PREFIX))
      .sort(
        (a, b) =>
          (read<{ lastUpdated?: number }>(a, {}).lastUpdated || 0) -
          (read<{ lastUpdated?: number }>(b, {}).lastUpdated || 0),
      );
    for (const key of entries.slice(0, Math.max(0, entries.length - 50))) remove(key);
  } catch (error) {
    console.error("Failed to save lyrics settings:", error);
  }
}

/** Reset also clears the older settings store without changing existing database names. */
export async function clearStoredSettings() {
  await localforage.createInstance({ name: "moonlit", storeName: "settings" }).clear();
  await clearMediaCache();
  for (const key of Object.keys(localStorage)) if (key.startsWith("moonlit")) remove(key);
}

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
  sizes: Record<string, number>;
}

let mediaWork: Promise<unknown> = Promise.resolve();
function withMediaStore<T>(work: () => Promise<T>): Promise<T> {
  const result = mediaWork.then(async (): Promise<T> => {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request("moonlit-media-storage", work);
    return work();
  });
  mediaWork = result.catch(() => {});
  return result;
}

async function getMeta(): Promise<CacheMeta> {
  try {
    const stored = await mediaStore.getItem<Partial<CacheMeta>>(META_KEY);
    return { order: stored?.order || [], sizes: stored?.sizes || {} };
  } catch {
    return { order: [], sizes: {} };
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
  if (!key || key === META_KEY) return null;
  try {
    const value = await mediaStore.getItem<Blob>(key);
    return value instanceof Blob && value.size > 0 ? value : null;
  } catch (e) {
    console.error("Failed to get media from cache:", e);
    return null;
  }
}

export async function setMediaCache(key: string, blob: Blob): Promise<void> {
  if (!key || key === META_KEY || !blob.size) return;
  try {
    await withMediaStore(async () => {
      await mediaStore.setItem(key, blob);
      const meta = await getMeta();
      meta.order = [key, ...meta.order.filter((entry) => entry !== key)];
      meta.sizes[key] = blob.size;

      while (meta.order.length > MAX_CACHED_TRACKS) {
        const evict = meta.order.pop();
        if (evict && evict !== META_KEY) {
          await mediaStore.removeItem(evict);
          delete meta.sizes[evict];
        }
      }

      await saveMeta(meta);
    });
    notifyMediaCacheChanged();
  } catch (e) {
    console.error("Failed to cache media:", e);
  }
}

export async function getCachedMediaUrl(sourceUrl: string): Promise<string | null> {
  return withMediaStore(async () => {
    const blob = await getMedia(sourceUrl);
    if (!blob) return null;
    const meta = await getMeta();
    if (meta.order[0] !== sourceUrl || meta.sizes[sourceUrl] !== blob.size) {
      meta.order = [sourceUrl, ...meta.order.filter((key) => key !== sourceUrl)];
      meta.sizes[sourceUrl] = blob.size;
      await saveMeta(meta);
    }
    return URL.createObjectURL(blob);
  });
}

/** True when IndexedDB already holds audio for this source (offline replay). */
export async function hasCachedMedia(sourceUrl: string): Promise<boolean> {
  if (!sourceUrl || sourceUrl === META_KEY) return false;
  try {
    return await withMediaStore(async () => {
      if (!(await mediaStore.keys()).includes(sourceUrl)) return false;
      const meta = await getMeta();
      if (meta.sizes[sourceUrl] === undefined) {
        meta.sizes[sourceUrl] = (await getMedia(sourceUrl))?.size || 0;
        await saveMeta(meta);
      }
      return meta.sizes[sourceUrl] > 0;
    });
  } catch {
    return false;
  }
}

/** Only files actually present on this device belong in the local-music library. */
export async function getAvailableMediaSources(): Promise<string[]> {
  try {
    return await withMediaStore(async () => {
      const keys = (await mediaStore.keys()).filter((key) => key !== META_KEY);
      const meta = await getMeta();
      let migrated = false;
      // Read older blobs once to build the inventory, then only read keys and sizes.
      for (const key of keys) {
        if (meta.sizes[key] !== undefined) continue;
        meta.sizes[key] = (await getMedia(key))?.size || 0;
        migrated = true;
      }
      if (migrated) await saveMeta(meta);
      return keys.filter((key) => meta.sizes[key] > 0);
    });
  } catch {
    return [];
  }
}

export async function clearMediaCache(): Promise<void> {
  try {
    await withMediaStore(() => mediaStore.clear());
    await artworkCache.clear();
    notifyMediaCacheChanged();
  } catch (e) {
    console.error("Failed to clear media cache:", e);
  }
}
