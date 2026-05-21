import { defaultYouTubeThumbnailById, searchResultThumbnailUrl } from "@/lib/imageProxy";
import {
  type YouTubeSearchResult,
  searchYouTube as searchYouTubeYtDlp,
} from "@/lib/yt-dlp";
import { getYouTubeId, isYoutubeURL } from "@/utils";

const BASE = "https://www.googleapis.com/youtube/v3";

/** YouTube video category ID for Music (see Data API videoCategories.list). */
export const YOUTUBE_MUSIC_CATEGORY_ID = "10";

const YTDLP_SEARCH_MAX = 10;

/** User-facing hint when Data API + yt-dlp search both fail (shown in API JSON and UI). */
export const YOUTUBE_SEARCH_UNAVAILABLE_MESSAGE =
  "Search is unavailable: YouTube's API and the backup search both failed. If you self-host Moonlit, set YOUTUBE_API_KEY and add YouTube cookies in Settings (or data/cookies.txt) to reach restricted or blocked content.";

export class YouTubeSearchUnavailableError extends Error {
  readonly code = "SEARCH_UNAVAILABLE" as const;

  constructor(message: string = YOUTUBE_SEARCH_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "YouTubeSearchUnavailableError";
  }
}

class YouTubeDataApiError extends Error {
  readonly rateLimited: boolean;

  constructor(
    message: string,
    readonly status: number,
    rateLimited: boolean,
  ) {
    super(message);
    this.name = "YouTubeDataApiError";
    this.rateLimited = rateLimited;
  }
}

interface VideoSnippet {
  title?: string;
  channelTitle?: string;
  categoryId?: string;
  liveBroadcastContent?: string;
  thumbnails?: {
    default?: { url?: string };
    medium?: { url?: string };
    high?: { url?: string };
    standard?: { url?: string };
  };
}

interface VideoResource {
  id: string;
  snippet?: VideoSnippet;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

interface GoogleApiErrorJson {
  error?: {
    message?: string;
    code?: number;
    errors?: Array<{ domain?: string; reason?: string; message?: string }>;
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseIso8601Duration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(iso);
  if (!m) return 0;
  const h = Number(m[1] ?? 0);
  const minutes = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + minutes * 60 + s;
}

function pickThumbnail(snippet: VideoSnippet): string {
  const th = snippet.thumbnails;
  /** Prefer high / standard / medium — not maxres (lighter for search lists). */
  return th?.high?.url ?? th?.standard?.url ?? th?.medium?.url ?? th?.default?.url ?? "";
}

function mapVideoResource(v: VideoResource): YouTubeSearchResult | null {
  const title = v.snippet?.title;
  if (!title || !v.id) return null;

  const viewRaw = v.statistics?.viewCount;
  let viewCount: number | undefined;
  if (viewRaw !== undefined && viewRaw !== "") {
    const n = Number(viewRaw);
    if (!Number.isNaN(n)) viewCount = n;
  }

  const isLive = v.snippet?.liveBroadcastContent === "live";

  const rawThumb = (v.snippet ? pickThumbnail(v.snippet) : "").trim();
  const resolvedThumb = rawThumb || defaultYouTubeThumbnailById(v.id);
  return {
    id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title,
    author: v.snippet?.channelTitle ?? "YouTube",
    thumbnail: searchResultThumbnailUrl(resolvedThumb),
    lengthSeconds: parseIso8601Duration(v.contentDetails?.duration ?? "PT0S"),
    ...(viewCount !== undefined ? { viewCount } : {}),
    ...(isLive ? { isLive: true } : {}),
  };
}

/** True when the Data API response indicates quota/rate limits (safe to retry with yt-dlp). */
function isDataApiRateOrQuotaLimited(status: number, body: GoogleApiErrorJson): boolean {
  if (status === 429) return true;

  const reasons = (body.error?.errors ?? [])
    .map((e) => (e.reason ?? "").toLowerCase())
    .join(" ");
  if (/quota|ratelimit|userratelimit/.test(reasons)) return true;

  const msg = (body.error?.message ?? "").toLowerCase();
  if (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limit") ||
    msg.includes("exceeded")
  ) {
    if (status === 403 || status === 429 || status === 503) return true;
  }
  return false;
}

function withSearchThumbnails(rows: YouTubeSearchResult[]): YouTubeSearchResult[] {
  return rows.map((r) => ({
    ...r,
    thumbnail: searchResultThumbnailUrl(
      r.thumbnail.trim() || defaultYouTubeThumbnailById(r.id),
    ),
  }));
}

async function throwIfApiNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  let body: GoogleApiErrorJson = {};
  try {
    body = (await res.json()) as GoogleApiErrorJson;
  } catch {
    // ignore
  }
  const message =
    typeof body.error?.message === "string" && body.error.message
      ? body.error.message
      : `YouTube API request failed (${res.status}).`;
  const rateLimited = isDataApiRateOrQuotaLimited(res.status, body);
  throw new YouTubeDataApiError(message, res.status, rateLimited);
}

async function fetchVideosByIds(
  ids: string[],
  apiKey: string,
  options: { categoryId?: string } = {},
): Promise<Map<string, YouTubeSearchResult>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, YouTubeSearchResult>();
  const wantCategory = options.categoryId;

  for (const group of chunk(unique, 50)) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      id: group.join(","),
      key: apiKey,
    });
    const res = await fetch(`${BASE}/videos?${params}`);
    await throwIfApiNotOk(res);
    const data = (await res.json()) as { items?: VideoResource[] };
    for (const item of data.items ?? []) {
      if (wantCategory && item.snippet?.categoryId !== wantCategory) {
        continue;
      }
      const row = mapVideoResource(item);
      if (row) map.set(item.id, row);
    }
  }

  return map;
}

async function searchWithDataApi(
  q: string,
  limit: number,
  apiKey: string,
): Promise<YouTubeSearchResult[]> {
  if (isYoutubeURL(q)) {
    const id = getYouTubeId(q);
    if (!id) return [];
    const byId = await fetchVideosByIds([id], apiKey, {
      categoryId: YOUTUBE_MUSIC_CATEGORY_ID,
    });
    const single = byId.get(id);
    return single ? [single] : [];
  }

  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: String(limit),
    q,
    videoCategoryId: YOUTUBE_MUSIC_CATEGORY_ID,
    key: apiKey,
  });

  const searchRes = await fetch(`${BASE}/search?${searchParams}`);
  await throwIfApiNotOk(searchRes);

  const searchJson = (await searchRes.json()) as {
    items?: Array<{ id?: { videoId?: string } }>;
  };

  const ids = (searchJson.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  if (!ids.length) return [];

  const byId = await fetchVideosByIds(ids, apiKey, {
    categoryId: YOUTUBE_MUSIC_CATEGORY_ID,
  });
  const ordered: YouTubeSearchResult[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

async function trySearchWithYtDlp(
  q: string,
  ytDlpLimit: number,
): Promise<YouTubeSearchResult[]> {
  try {
    const rows = await searchYouTubeYtDlp(q, { limit: ytDlpLimit });
    return withSearchThumbnails(rows);
  } catch (cause) {
    console.error("[Moonlit] yt-dlp search failed.", cause);
    throw new YouTubeSearchUnavailableError();
  }
}

/**
 * Search YouTube: prefers the Data API (music category) when `YOUTUBE_API_KEY` is set;
 * falls back to yt-dlp search when the API is rate-limited / quota exhausted, or on other API failures.
 * Without an API key, uses yt-dlp only.
 */
export async function searchYouTubeVideos(
  query: string,
  options: { limit?: number } = {},
): Promise<YouTubeSearchResult[]> {
  const limit = Math.min(Math.max(Number(options.limit) || 3, 1), 50);
  const q = query.trim();
  if (!q) return [];

  const ytDlpLimit = Math.min(limit, YTDLP_SEARCH_MAX);
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  if (!apiKey) {
    return trySearchWithYtDlp(q, ytDlpLimit);
  }

  try {
    return await searchWithDataApi(q, limit, apiKey);
  } catch (apiErr) {
    if (apiErr instanceof YouTubeDataApiError && apiErr.rateLimited) {
      console.warn(
        "[Moonlit] YouTube Data API rate limited or quota exceeded; falling back to yt-dlp search.",
      );
    } else {
      console.warn(
        "[Moonlit] YouTube Data API search failed; falling back to yt-dlp search.",
        apiErr,
      );
    }
    return trySearchWithYtDlp(q, ytDlpLimit);
  }
}
