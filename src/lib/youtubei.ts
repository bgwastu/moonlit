import { readFile } from "fs/promises";
import path from "path";
import { Innertube, UniversalCache, YTNodes } from "youtubei.js";
import { getYouTubeId } from "@/utils";

export const YOUTUBE_ANDROID_VR_UA =
  "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; Quest 3 Build/SQ3A.220605.009.A1) gzip";

export interface YouTubeSearchResult {
  id: string;
  url: string;
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds: number;
  viewCount?: number;
  isLive?: boolean;
  artists?: { name: string; channelId?: string }[];
  album?: { name: string; id?: string };
}

export interface MusicSearchResult {
  id: string;
  url: string;
  title: string;
  artists: { name: string; channelId?: string }[];
  album?: { name: string; id?: string };
  thumbnail: string;
  lengthSeconds: number;
}

export interface StreamInfo {
  url: string;
  contentType: string;
  headers: Record<string, string>;
  duration: number;
  title: string;
  author: string;
  artist?: string;
  album?: string;
  thumbnail: string;
  sourceUrl: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

// ---- Cache constants ----
const SEARCH_TTL_MS = 30 * 60 * 1000;
const INSTANCE_TTL_MS = 4 * 60 * 60 * 1000;

// ---- Simple value cache (no TTL logic, no persistence) ----
// Just stores { value, cachedAt }. TTL / stale logic lives in the callers.
class CacheStore<T> {
  private store = new Map<string, { value: T; cachedAt: number }>();

  get(key: string): { value: T; cachedAt: number } | undefined {
    return this.store.get(key);
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, cachedAt: Date.now() });
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

// ---- Cache instances ----
const searchCache = new CacheStore<YouTubeSearchResult[]>();
const musicSearchCache = new CacheStore<MusicSearchResult[]>();

// Instance cache stores the Promise<Innertube> directly (not wrapped in our CacheStore)
// because we use a different TTL check pattern for it.
const instanceStore = new Map<
  string,
  { promise: Promise<Innertube>; expiresAt: number }
>();

// ---- Cookie helpers ----
async function getSystemCookieString(): Promise<string | null> {
  try {
    const content = (await readFile(SYSTEM_COOKIES_PATH, "utf-8")).trim();
    if (!content) return null;
    return netscapeToCookieString(content);
  } catch {
    return null;
  }
}

function netscapeToCookieString(netscape: string): string {
  const pairs: string[] = [];
  for (const line of netscape.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 7) continue;
    const name = parts[5]?.trim();
    const value = parts[6]?.trim();
    if (name && value) {
      pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
    }
  }
  return pairs.join("; ");
}

async function resolveCookieString(userCookies?: string): Promise<string | undefined> {
  if (userCookies?.trim()) {
    if (userCookies.includes("\t") || userCookies.includes("#")) {
      return netscapeToCookieString(userCookies);
    }
    return userCookies;
  }
  return (await getSystemCookieString()) ?? undefined;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

// ---- Innertube instance management ----
const DEFAULT_INSTANCE_KEY = "__default__";

async function getInnertube(
  cookieString?: string,
  clientType?: string,
): Promise<Innertube> {
  const effectiveCookie = await resolveCookieString(cookieString);
  const key = `${clientType || "WEB"}::${effectiveCookie ? simpleHash(effectiveCookie) : DEFAULT_INSTANCE_KEY}`;

  const existing = instanceStore.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    return existing.promise;
  }

  const promise = Innertube.create({
    cache: new UniversalCache(true),
    ...(effectiveCookie ? { cookie: effectiveCookie } : {}),
    ...(clientType ? { client_type: clientType as any } : {}),
  });

  instanceStore.set(key, { promise, expiresAt: Date.now() + INSTANCE_TTL_MS });
  return promise;
}

// ---- Search ----
export async function searchYouTube(
  query: string,
  options: { limit?: number; cookies?: string } = {},
): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 10);
  const cacheKey = `q=${cleanQuery}|limit=${limit}|c=${simpleHash(options.cookies || "")}`;

  const cached = searchCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age < SEARCH_TTL_MS) return cached.value;
  }

  const yt = await getInnertube(options.cookies, "ANDROID_VR");
  const search = await yt.search(cleanQuery, { type: "video" });

  const results: YouTubeSearchResult[] = [];
  const videos = search.results.filterType(YTNodes.Video);

  for (const video of videos) {
    if (results.length >= limit) break;
    const id = video.video_id;
    if (!id || !/^[\w-]{11}$/.test(id)) continue;

    const duration = video.duration;
    const lengthSeconds = duration?.seconds ?? 0;
    if (lengthSeconds <= 0) continue;

    const thumbnail =
      video.best_thumbnail?.url ||
      video.thumbnails?.[0]?.url ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    results.push({
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: video.title?.toString() || "Untitled",
      author: video.author?.name || "YouTube",
      thumbnail,
      lengthSeconds,
      ...(video.view_count && { viewCount: parseViewCount(video.view_count.toString()) }),
      ...(video.is_live && { isLive: true }),
    });
  }

  if (results.length > 0) {
    searchCache.set(cacheKey, results);
  }
  return results;
}

// ---- Music search ----
export async function searchMusic(
  query: string,
  options: { limit?: number; cookies?: string } = {},
): Promise<MusicSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 10);
  const cacheKey = `music:q=${cleanQuery}|limit=${limit}|c=${simpleHash(options.cookies || "")}`;

  const cached = musicSearchCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age < SEARCH_TTL_MS) return cached.value;
  }

  const yt = await getInnertube(options.cookies, "ANDROID_VR");
  const search = await yt.music.search(cleanQuery, { type: "song" });

  const songs = search.songs?.contents || [];
  const results: MusicSearchResult[] = [];

  for (const item of songs) {
    if (results.length >= limit) break;

    const song = item as {
      id?: string;
      title?: string;
      artists?: { name: string; channel_id?: string }[];
      album?: { id?: string; name: string };
      duration?: { text: string; seconds: number };
      thumbnails?: { url: string; width: number; height: number }[];
    };

    const id = song.id;
    if (!id || !/^[\w-]{11}$/.test(id)) continue;

    const duration = song.duration;
    const lengthSeconds = duration?.seconds ?? 0;
    if (lengthSeconds <= 0) continue;

    const thumbnails = song.thumbnails || [];
    const thumbnail = thumbnails[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    const artists: { name: string; channelId?: string }[] = (song.artists || []).map(
      (a) => ({
        name: a.name || "Unknown",
        ...(a.channel_id ? { channelId: a.channel_id } : {}),
      }),
    );

    results.push({
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: song.title || "Untitled",
      artists,
      ...(song.album?.name
        ? { album: { name: song.album.name, id: song.album.id } }
        : {}),
      thumbnail,
      lengthSeconds,
    });
  }

  if (results.length > 0) {
    musicSearchCache.set(cacheKey, results);
  }
  return results;
}

function parseViewCount(text: string): number {
  const cleaned = text.replace(/[^0-9,]/g, "");
  return parseInt(cleaned.replace(/,/g, ""), 10) || 0;
}

function pickThumbnail(
  thumbnails: { url?: string; width?: number; height?: number }[],
): string {
  if (!thumbnails?.length) return "";
  let best = thumbnails[0];
  for (const t of thumbnails) {
    if ((t.width || 0) > (best.width || 0)) best = t;
  }
  return best.url || "";
}

// ---- Stream extraction ----

/**
 * Internal: perform the full YouTube extraction (Innertube + getBasicInfo + format pick).
 */
async function doFullExtraction(
  id: string,
  sourceUrl: string,
  options: { cookies?: string; signal?: AbortSignal },
): Promise<StreamInfo> {
  const yt = await getInnertube(options.cookies, "ANDROID_VR");

  const info = await yt.getBasicInfo(id);
  const basic = info.basic_info;

  if (!basic) {
    throw new Error("Could not retrieve video information.");
  }

  const playability = info.playability_status;
  if (playability && playability.status !== "OK") {
    throw new Error(playability.reason || "This video is not available for streaming.");
  }

  if (!info.streaming_data) {
    throw new Error(
      "No streaming data available. Try configuring cookies from a logged-in account in the app settings.",
    );
  }

  const formats = [
    ...(info.streaming_data.formats || []),
    ...(info.streaming_data.adaptive_formats || []),
  ].filter((f) => f.has_audio && !f.has_video);

  if (!formats.length) {
    throw new Error("No audio formats available for this video.");
  }

  const format =
    formats.find((f) => f.mime_type?.includes("mp4")) ||
    formats.sort((a, b) => b.bitrate - a.bitrate)[0];
  const streamUrl = format.url;

  if (!streamUrl) {
    throw new Error("Could not obtain a usable stream URL.");
  }

  const contentType = format.mime_type?.split(";")[0]?.trim() || "audio/mp4";

  let artist: string | undefined;
  let album: string | undefined;
  let thumbnail = pickThumbnail(basic.thumbnail || []);

  try {
    const musicInfo = await yt.music.getInfo(id);

    const musicBasic = musicInfo.basic_info;

    if (musicBasic && musicBasic.author && musicBasic.author !== basic.author) {
      artist = musicBasic.author;
    }

    if (musicBasic && typeof (musicBasic as any).album !== "undefined") {
      album = (musicBasic as any).album;
    }

    const musicThumb = pickThumbnail(
      (musicBasic?.thumbnail as { url?: string; width?: number; height?: number }[]) ||
        [],
    );
    if (musicThumb) {
      thumbnail = musicThumb;
    }
  } catch {}

  return {
    url: streamUrl,
    contentType,
    headers: {
      "User-Agent": YOUTUBE_ANDROID_VR_UA,
    },
    duration: Math.floor(Number(basic.duration) || 0),
    title: basic.title || "Unknown",
    author: basic.author || "Unknown",
    thumbnail,
    artist: artist || basic.author,
    album,
    sourceUrl,
  };
}

/**
 * Extract a playable stream URL for a YouTube video.
 */
export async function extractStreamUrl(
  url: string,
  options: {
    cookies?: string;
    signal?: AbortSignal;
  } = {},
): Promise<StreamInfo> {
  const id = getYouTubeId(url);
  if (!id) throw new Error("Invalid YouTube URL");

  return doFullExtraction(id, url, options);
}
