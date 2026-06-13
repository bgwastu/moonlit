import { existsSync, readFileSync } from "fs";
import path from "path";
import { Innertube, UniversalCache, YTNodes } from "youtubei.js";
import { getYouTubeId, isYoutubeURL } from "@/utils";

export interface VideoInfo {
  title: string;
  author: string;
  artist?: string;
  album?: string;
  thumbnail: string;
  lengthSeconds: number;
}

export interface YouTubeSearchResult {
  id: string;
  url: string;
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds: number;
  viewCount?: number;
  isLive?: boolean;
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
const SEARCH_TTL_MS = 30 * 60 * 1000;
const STREAM_URL_TTL_MS = 5 * 60 * 60 * 1000;
const INSTANCE_TTL_MS = 30 * 60 * 1000;

class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttl });
    this.pruneExpired();
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

const searchCache = new TtlCache<YouTubeSearchResult[]>(SEARCH_TTL_MS);
const streamUrlCache = new TtlCache<StreamInfo>(STREAM_URL_TTL_MS);
const instanceCache = new TtlCache<Promise<Innertube>>(INSTANCE_TTL_MS);

export function hasSystemCookies(): boolean {
  try {
    const content = readFileSync(SYSTEM_COOKIES_PATH, "utf-8").trim();
    return content.length > 0;
  } catch {
    return false;
  }
}

function getSystemCookieString(): string | null {
  try {
    const content = readFileSync(SYSTEM_COOKIES_PATH, "utf-8").trim();
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

function resolveCookieString(userCookies?: string): string | undefined {
  if (userCookies?.trim()) {
    if (userCookies.includes("\t") || userCookies.includes("#")) {
      return netscapeToCookieString(userCookies);
    }
    return userCookies;
  }
  return getSystemCookieString() ?? undefined;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

const DEFAULT_INSTANCE_KEY = "__default__";

async function getInnertube(
  cookieString?: string,
  clientType?: string,
): Promise<Innertube> {
  const effectiveCookie = resolveCookieString(cookieString);
  const key = `${clientType || "WEB"}::${effectiveCookie ? simpleHash(effectiveCookie) : DEFAULT_INSTANCE_KEY}`;

  const cached = instanceCache.get(key);
  if (cached) return cached;

  const promise = Innertube.create({
    cache: new UniversalCache(true),
    ...(effectiveCookie ? { cookie: effectiveCookie } : {}),
    ...(clientType ? { client_type: clientType as any } : {}),
  });

  instanceCache.set(key, promise);
  return promise;
}

export async function searchYouTube(
  query: string,
  options: { limit?: number; cookies?: string } = {},
): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 10);
  const cacheKey = `q=${cleanQuery}|limit=${limit}|c=${simpleHash(options.cookies || "")}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const yt = await getInnertube(options.cookies);
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

export async function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo> {
  const id = getYouTubeId(url);
  if (!id) throw new Error("Invalid YouTube URL");

  const yt = await getInnertube(cookies);
  const info = await yt.getBasicInfo(id);
  const basic = info.basic_info;

  return {
    title: basic?.title || "Unknown",
    author: basic?.author || "Unknown",
    thumbnail: pickThumbnail(basic?.thumbnail || []),
    lengthSeconds: Math.floor(Number(basic?.duration) || 0),
  };
}

export async function extractStreamUrl(
  url: string,
  options: {
    cookies?: string;
    signal?: AbortSignal;
  } = {},
): Promise<StreamInfo> {
  const id = getYouTubeId(url);
  if (!id) throw new Error("Invalid YouTube URL");

  const cacheKey = `stream:${id}`;
  const cached = streamUrlCache.get(cacheKey);
  if (cached) return cached;

  // Use ANDROID_VR client which provides direct streaming URLs without needing decipher
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

  // Find the best audio format — prefer m4a (AAC) for better proxy compatibility
  const formats = [
    ...(info.streaming_data.formats || []),
    ...(info.streaming_data.adaptive_formats || []),
  ].filter((f) => f.has_audio && !f.has_video);

  if (!formats.length) {
    throw new Error("No audio formats available for this video.");
  }

  // Prefer m4a (AAC) for reliable streaming through the proxy, then opus
  const format =
    formats.find((f) => f.mime_type?.includes("mp4")) ||
    formats.sort((a, b) => b.bitrate - a.bitrate)[0];
  const streamUrl = format.url;

  if (!streamUrl) {
    throw new Error("Could not obtain a usable stream URL.");
  }

  const contentType = format.mime_type?.split(";")[0]?.trim() || "audio/mp4";

  const streamInfo: StreamInfo = {
    url: streamUrl,
    contentType,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.200 Mobile Safari/537.36",
    },
    duration: Math.floor(Number(basic.duration) || 0),
    title: basic.title || "Unknown",
    author: basic.author || "Unknown",
    thumbnail: pickThumbnail(basic.thumbnail || []),
    sourceUrl: url,
  };

  streamUrlCache.set(cacheKey, streamInfo);
  return streamInfo;
}
