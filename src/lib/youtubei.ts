import { createHash } from "node:crypto";
import { Constants, Innertube, UniversalCache, YTNodes } from "youtubei.js";
import { upgradeCoverUrl } from "@/lib/coverUrl";
import { resolveYoutubeCredentials } from "@/lib/youtubeCredentials";
import { getYouTubeId } from "@/utils";

export const YOUTUBE_IOS_UA =
  "com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)";

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
export type YoutubeCookieSource = "user" | "system" | "none";

/** The explicitly selected credential source for YouTube requests. */
export async function getYoutubeCookieSource(
  userCookies?: string,
): Promise<YoutubeCookieSource> {
  const credentials = await resolveYoutubeCredentials(userCookies);
  return credentials.mode === "anonymous" ? "none" : credentials.mode;
}

function simpleHash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---- Innertube instance management ----
const DEFAULT_INSTANCE_KEY = "__default__";

async function getInnertube(
  cookieString?: string,
  clientType?: string,
): Promise<Innertube> {
  const effectiveCookie = (await resolveYoutubeCredentials(cookieString)).cookies;
  const key = `${clientType || "WEB"}::${effectiveCookie ? simpleHash(effectiveCookie) : DEFAULT_INSTANCE_KEY}`;

  const existing = instanceStore.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    return existing.promise;
  }

  const promise = Innertube.create({
    cache: new UniversalCache(true),
    ...(effectiveCookie ? { cookie: effectiveCookie } : {}),
    ...(clientType ? { client_type: clientType as any } : {}),
    fetch: (input, init: RequestInit = {}) =>
      fetch(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      }),
  }).catch((error) => {
    instanceStore.delete(key);
    throw error;
  });

  instanceStore.set(key, { promise, expiresAt: Date.now() + INSTANCE_TTL_MS });
  return promise;
}

// ---- Search ----
export async function searchYouTube(
  query: string,
  options: { limit?: number; cookies?: string; bypassCache?: boolean } = {},
): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit =
    options.limit != null ? Math.max(1, options.limit) : Number.POSITIVE_INFINITY;
  const credentials = await resolveYoutubeCredentials(options.cookies);
  const cacheKey = `q=${cleanQuery}|limit=${limit}|c=${credentials.scope}`;

  const cached = searchCache.get(cacheKey);
  if (cached && !options.bypassCache) {
    const age = Date.now() - cached.cachedAt;
    if (age < SEARCH_TTL_MS) return cached.value;
  }

  const yt = await getInnertube(options.cookies, "WEB");
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

    const thumbnail = upgradeCoverUrl(
      video.best_thumbnail?.url ||
        pickThumbnail(video.thumbnails || []) ||
        `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    );

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
  options: { limit?: number; cookies?: string; bypassCache?: boolean } = {},
): Promise<MusicSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit =
    options.limit != null ? Math.max(1, options.limit) : Number.POSITIVE_INFINITY;
  const credentials = await resolveYoutubeCredentials(options.cookies);
  const cacheKey = `music:q=${cleanQuery}|limit=${limit}|c=${credentials.scope}`;

  const cached = musicSearchCache.get(cacheKey);
  if (cached && !options.bypassCache) {
    const age = Date.now() - cached.cachedAt;
    if (age < SEARCH_TTL_MS) return cached.value;
  }

  const yt = await getInnertube(options.cookies, "WEB");
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

    const thumbnail = upgradeCoverUrl(
      pickThumbnail(song.thumbnails || []) ||
        `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    );

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
  return upgradeCoverUrl(best.url || "");
}

// ---- Stream extraction ----

type ExtractClient = "IOS" | "ANDROID_VR" | "TV";

const EXTRACT_CLIENTS: ExtractClient[] = ["IOS", "ANDROID_VR", "TV"];

function userAgentForClient(client: ExtractClient): string {
  if (client === "IOS") return YOUTUBE_IOS_UA;
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
    lower.includes("network") ||
    lower.includes("status code 400")
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
  options.signal?.throwIfAborted();
  const clientType = options.clientType ?? "IOS";
  const yt = await getInnertube(options.cookies, clientType);

  const info = await yt.getBasicInfo(id, { client: clientType });
  options.signal?.throwIfAborted();
  const basic = info.basic_info;

  if (!basic) {
    throw new Error("Could not retrieve video information.");
  }

  const playability = info.playability_status;
  if (playability && playability.status !== "OK") {
    throw new Error(playability.reason || "This video is not available for streaming.");
  }

  if (!info.streaming_data) {
    throw new Error("YouTube did not provide streaming data for this track.");
  }

  const allFormats: YTFormat[] = [
    ...(info.streaming_data.formats || []),
    ...(info.streaming_data.adaptive_formats || []),
  ];

  const formats = allFormats.filter((f) => f.has_audio && !f.has_video);

  if (!formats.length) {
    throw new Error("No audio formats available for this video.");
  }

  const sortedAudioFormats = formats
    .filter((f) => f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  const format =
    sortedAudioFormats.find((f) => f.mime_type?.includes("mp4")) || sortedAudioFormats[0];
  const streamUrl = format?.url;

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
 * Primary extraction using Android testsuite player request (params=2AMB).
 * Bypasses YouTube's 403 range cutoff that affects standard ANDROID_VR streams past ~262KB / 60s.
 */
async function extractWithAndroidTestsuite(
  id: string,
  sourceUrl: string,
  cookies?: string,
): Promise<StreamInfo | null> {
  try {
    const yt = await getInnertube(cookies, "ANDROID");
    const playerRes = await yt.actions.execute("/player", {
      videoId: id,
      params: "2AMB",
      client: "ANDROID",
    });

    const data = playerRes.data as {
      playabilityStatus?: { status?: string; reason?: string };
      videoDetails?: {
        title?: string;
        author?: string;
        lengthSeconds?: string | number;
        thumbnail?: { thumbnails?: { url?: string; width?: number; height?: number }[] };
      };
      streamingData?: {
        formats?: Record<string, unknown>[];
        adaptiveFormats?: Record<string, unknown>[];
      };
    };

    if (data?.playabilityStatus?.status !== "OK" || !data.streamingData) {
      return null;
    }

    const allFormats = [
      ...(data.streamingData.formats || []),
      ...(data.streamingData.adaptiveFormats || []),
    ];

    const audioFormats = allFormats
      .filter(
        (f) => f.hasAudio !== false && !f.width && !f.height && typeof f.url === "string",
      )
      .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));

    if (!audioFormats.length) return null;

    const format =
      audioFormats.find((f) => String(f.mimeType || f.mime_type || "").includes("mp4")) ||
      audioFormats[0];

    const streamUrl = String(format.url);
    if (!streamUrl) return null;

    const rawMime = String(format.mimeType || format.mime_type || "audio/mp4");
    const contentType = rawMime.split(";")[0]?.trim() || "audio/mp4";
    const details = data.videoDetails;

    let artist: string | undefined;
    let album: string | undefined;
    let thumbnail = pickThumbnail(details?.thumbnail?.thumbnails || []);
    let isAudioTrackVideo = false;

    try {
      const musicInfo = await yt.music.getInfo(id);
      const musicBasic = musicInfo.basic_info;
      if (musicBasic?.author && musicBasic.author !== details?.author) {
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
      if (details?.author?.includes(" - Topic")) {
        isAudioTrackVideo = true;
      }
    }

    return {
      url: streamUrl,
      contentType,
      headers: {
        "User-Agent": Constants.CLIENTS.ANDROID.USER_AGENT,
      },
      duration: Math.floor(Number(details?.lengthSeconds) || 0),
      title: details?.title || "Unknown",
      author: details?.author || "Unknown",
      thumbnail,
      artist: artist || details?.author,
      album,
      sourceUrl,
      isAudioTrackVideo,
    };
  } catch (err) {
    console.warn("[Moonlit] Android testsuite extract failed:", (err as Error)?.message);
    return null;
  }
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
  options.signal?.throwIfAborted();
  const authenticated =
    (await resolveYoutubeCredentials(options.cookies)).mode !== "anonymous";

  const testsuiteStream = authenticated
    ? null
    : await extractWithAndroidTestsuite(id, url);
  options.signal?.throwIfAborted();
  if (testsuiteStream) return testsuiteStream;

  let lastError: Error | null = null;
  const clients: ExtractClient[] = authenticated ? ["TV"] : EXTRACT_CLIENTS;
  for (let i = 0; i < clients.length; i++) {
    options.signal?.throwIfAborted();
    const clientType = clients[i];
    try {
      return await doFullExtraction(id, url, { ...options, clientType });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      if (!isExtractRetriable(err.message)) throw err;
      console.warn(`[Moonlit] Extract failed with ${clientType}:`, err.message);
      if (i < clients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
      }
    }
  }

  throw lastError ?? new Error("Failed to extract stream.");
}
