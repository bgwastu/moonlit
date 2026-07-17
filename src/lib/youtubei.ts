import { readFile } from "fs/promises";
import path from "path";
import { Innertube, UniversalCache, YTNodes } from "youtubei.js";
import { getYouTubeId } from "@/utils";

export const YOUTUBE_ANDROID_VR_UA =
  "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

const YOUTUBE_TV_UA = "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version";

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
  /**
   * YouTube Music audio-track video (ATV / static art).
   * Hide Show video — use cover art; embed would not be a real MV.
   */
  isAudioTrackVideo?: boolean;
}

function readMusicVideoTypeFromPayload(
  payload: Record<string, unknown> | undefined,
): string | undefined {
  if (!payload) return undefined;
  const configs = payload.watchEndpointMusicSupportedConfigs as
    | { watchEndpointMusicConfig?: { musicVideoType?: string } }
    | undefined;
  return configs?.watchEndpointMusicConfig?.musicVideoType;
}

/** Prefer endpoint, then first musicVideoType found on the Music TrackInfo tree. */
function readMusicVideoType(musicInfo: unknown): string | undefined {
  if (!musicInfo || typeof musicInfo !== "object") return undefined;

  const info = musicInfo as {
    current_video_endpoint?: { payload?: Record<string, unknown> };
  };
  const fromEndpoint = readMusicVideoTypeFromPayload(
    info.current_video_endpoint?.payload,
  );
  if (fromEndpoint) return fromEndpoint;

  let found: string | undefined;
  const walk = (node: unknown, depth: number) => {
    if (found || !node || typeof node !== "object" || depth > 14) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.musicVideoType === "string") {
      found = obj.musicVideoType;
      return;
    }
    for (const value of Object.values(obj)) walk(value, depth + 1);
  };
  walk(musicInfo, 0);
  return found;
}

function isAudioTrackVideoType(type: string | undefined): boolean {
  return type === "MUSIC_VIDEO_TYPE_ATV";
}

type YTFormat = {
  url?: string;
  has_audio?: boolean;
  has_video?: boolean;
  bitrate?: number;
  mime_type?: string;
};

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
    // Cookie header values must stay raw — URI-encoding breaks LOGIN_INFO / PSID auth.
    if (name && value && !/[;\n\r]/.test(name) && !/[;\n\r]/.test(value)) {
      pairs.push(`${name}=${value}`);
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

export type YoutubeCookieSource = "user" | "system" | "none";

/** Which cookie layer would be used for YouTube requests (user header → system file → none). */
export async function getYoutubeCookieSource(
  userCookies?: string,
): Promise<YoutubeCookieSource> {
  if (userCookies?.trim()) return "user";
  const system = await getSystemCookieString();
  return system ? "system" : "none";
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

  const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
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

  const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
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

type ExtractClient = "ANDROID_VR" | "TV";

const EXTRACT_CLIENTS: ExtractClient[] = ["ANDROID_VR", "TV"];

function userAgentForClient(client: ExtractClient): string {
  return client === "TV" ? YOUTUBE_TV_UA : YOUTUBE_ANDROID_VR_UA;
}

function isExtractRetriable(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("no streaming data") ||
    lower.includes("not a bot") ||
    lower.includes("sign in to confirm") ||
    lower.includes("could not obtain") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  );
}

/**
 * Internal: perform the full YouTube extraction (Innertube + getBasicInfo + format pick).
 */
async function doFullExtraction(
  id: string,
  sourceUrl: string,
  options: { cookies?: string; signal?: AbortSignal; clientType?: ExtractClient },
): Promise<StreamInfo> {
  const clientType = options.clientType ?? "ANDROID_VR";
  const yt = await getInnertube(options.cookies, clientType);

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

  const allFormats: YTFormat[] = [
    ...(info.streaming_data.formats || []),
    ...(info.streaming_data.adaptive_formats || []),
  ];

  const formats = allFormats.filter((f) => f.has_audio && !f.has_video);

  if (!formats.length) {
    throw new Error("No audio formats available for this video.");
  }

  const format =
    formats.find((f) => f.mime_type?.includes("mp4")) ||
    formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  const streamUrl = format.url;

  if (!streamUrl) {
    throw new Error("Could not obtain a usable stream URL.");
  }

  const contentType = format.mime_type?.split(";")[0]?.trim() || "audio/mp4";

  let artist: string | undefined;
  let album: string | undefined;
  let thumbnail = pickThumbnail(basic.thumbnail || []);
  let isAudioTrackVideo = false;

  // Probe YTM for ATV vs real MV — video itself is shown via client embed, not proxied.
  try {
    const musicInfo = await yt.music.getInfo(id);
    const musicBasic = musicInfo.basic_info;

    if (musicBasic?.author && musicBasic.author !== basic.author) {
      artist = musicBasic.author;
    }

    if (musicBasic && typeof (musicBasic as { album?: string }).album !== "undefined") {
      album = (musicBasic as { album?: string }).album;
    }

    const musicThumb = pickThumbnail(
      (musicBasic?.thumbnail as { url?: string; width?: number; height?: number }[]) ||
        [],
    );
    if (musicThumb) thumbnail = musicThumb;

    isAudioTrackVideo = isAudioTrackVideoType(readMusicVideoType(musicInfo));
  } catch {
    // Music metadata is optional — basic_info is enough to play.
    if (basic.author?.includes(" - Topic")) {
      isAudioTrackVideo = true;
    }
  }

  return {
    url: streamUrl,
    contentType,
    headers: {
      "User-Agent": userAgentForClient(clientType),
    },
    duration: Math.floor(Number(basic.duration) || 0),
    title: basic.title || "Unknown",
    author: basic.author || "Unknown",
    thumbnail,
    artist: artist || basic.author,
    album,
    sourceUrl,
    isAudioTrackVideo,
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

  let lastError: Error | null = null;
  for (let i = 0; i < EXTRACT_CLIENTS.length; i++) {
    const clientType = EXTRACT_CLIENTS[i];
    try {
      return await doFullExtraction(id, url, { ...options, clientType });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      if (!isExtractRetriable(err.message)) throw err;
      console.warn(`[Moonlit] Extract failed with ${clientType}:`, err.message);
      if (i < EXTRACT_CLIENTS.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
      }
    }
  }

  throw lastError ?? new Error("Failed to extract stream.");
}
