import { spawn } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { isYoutubeURL } from "@/utils";

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

interface ExecuteResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface ExecuteOptions {
  target: string;
  args: string[];
  cookies?: string;
  youtube?: boolean;
  fast?: boolean;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  signal?: AbortSignal;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

const MAX_CONCURRENT_INFO = 5;
const PROCESS_RETRIES = 2;
const PROCESS_RETRY_BASE_DELAY_MS = 2000;
const VIDEO_INFO_TTL_MS = 5 * 60 * 1000;
const SEARCH_TTL_MS = 30 * 60 * 1000;
const STREAM_URL_TTL_MS = 5 * 60 * 60 * 1000;

const BASE_ARGS = [
  "--no-playlist",
  "--retries",
  "3",
  "--fragment-retries",
  "3",
  "--retry-sleep",
  "http:exp=1:8:2",
  "--retry-sleep",
  "fragment:exp=1:8:2",
  "--sleep-requests",
  "1",
  "--sleep-interval",
  "2",
  "--max-sleep-interval",
  "8",
];

const FAST_ARGS = ["--no-playlist", "--retries", "1", "--sleep-requests", "0.5"];

const YOUTUBE_ARGS = ["--extractor-args", "youtube:player_client=ios,web"];
const FAST_YOUTUBE_ARGS = ["--extractor-args", "youtube:player_client=android"];

class TtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    this.pruneExpired();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  private pruneExpired(): void {
    const now = Date.now();
    this.entries.forEach((entry, key) => {
      if (now > entry.expiresAt) this.entries.delete(key);
    });
  }
}

class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(count: number) {
    this.permits = count;
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.permits += 1;
  }
}

const infoSemaphore = new Semaphore(MAX_CONCURRENT_INFO);
const videoInfoCache = new TtlCache<VideoInfo>(VIDEO_INFO_TTL_MS);
const searchCache = new TtlCache<YouTubeSearchResult[]>(SEARCH_TTL_MS);
const streamUrlCache = new TtlCache<StreamInfo>(STREAM_URL_TTL_MS);

const ERROR_RULES: Array<{ patterns: string[]; message: string }> = [
  {
    patterns: ["private", "video unavailable", "video is private"],
    message: "This video is private or unavailable.",
  },
  {
    patterns: ["age-restricted", "sign in to confirm your age"],
    message:
      "This content is age-restricted. Try configuring cookies from a logged-in account.",
  },
  {
    patterns: ["geo", "not available in your country"],
    message: "This content is not available in your region.",
  },
  {
    patterns: ["not a bot", "confirm you're not a bot", "confirm you\u2019re not a bot"],
    message:
      "YouTube asked for verification (often labeled as a bot check). Add cookies via Moonlit cookie settings from the homepage, export server cookies (`data/cookies.txt`), or use `--cookies-from-browser` on yt-dlp if you administer the host.",
  },
  {
    patterns: ["login required", "sign in", "members only"],
    message:
      "This content requires login. Try configuring cookies from a logged-in account.",
  },
  {
    patterns: ["rate-limit", "captcha", "too many requests", "http error 429"],
    message: "Rate limited. Please wait and try again, or use cookies.",
  },
  {
    patterns: ["drm", "protected content"],
    message: "This content is DRM protected and cannot be downloaded.",
  },
  {
    patterns: ["http error 404", "video not found"],
    message: "Content not found.",
  },
  {
    patterns: ["http error 403", "forbidden"],
    message: "Access forbidden.",
  },
  {
    patterns: ["connection", "timed out", "network"],
    message: "Network error. Please try again.",
  },
  {
    patterns: ["unsupported url", "no video formats found"],
    message: "Unsupported URL.",
  },
  {
    patterns: ["live", "premiere", "upcoming"],
    message: "Live streams and premieres cannot be downloaded.",
  },
  {
    patterns: [
      "signature solving failed",
      "sig function possibilities",
      "challenge solving failed",
    ],
    message:
      "YouTube challenge solving failed. Update yt-dlp (and yt-dlp-ejs) on the host/container and try again.",
  },
  {
    patterns: ["requested format is not available", "only images are available"],
    message: "Requested format is not available.",
  },
];

const RETRYABLE_PATTERNS = [
  "rate-limit",
  "too many requests",
  "captcha",
  "connection",
  "timed out",
  "network",
  "not a bot",
  "confirm you're not a bot",
  "signature solving failed",
  "challenge solving failed",
  "http error 429",
];

export function hasSystemCookies(): boolean {
  try {
    if (!existsSync(SYSTEM_COOKIES_PATH)) return false;
    return readFileSync(SYSTEM_COOKIES_PATH, "utf-8").trim().length > 0;
  } catch {
    return false;
  }
}

export async function searchYouTube(
  query: string,
  options: { limit?: number; cookies?: string } = {},
): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 10);
  const cacheKey = `q=${cleanQuery}|limit=${limit}|${cookieCacheKey("cookies", options.cookies)}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const target = isYoutubeURL(cleanQuery) ? cleanQuery : `ytsearch${limit}:${cleanQuery}`;
  const result = await executeYtDlp({
    target,
    youtube: true,
    cookies: options.cookies,
    args: ["--skip-download", "--flat-playlist", "-J", target],
  });

  throwIfFailed(result);

  const rows = parseSearchJson(result.stdout).filter(isYtSearchVideoRow);
  const final = rows.slice(0, isYoutubeURL(cleanQuery) ? 1 : limit);
  searchCache.set(cacheKey, final);
  return final;
}

export async function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo> {
  const canCache = isYoutubeURL(url);
  const cacheKey = canCache ? cookieCacheKey(url, cookies) : undefined;
  const cached = cacheKey ? videoInfoCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const result = await executeYtDlp({
    target: url,
    youtube: canCache,
    cookies,
    args: ["--skip-download", "-J", url],
  });

  throwIfFailed(result);

  const videoInfo = parseVideoInfoJson(result.stdout);
  if (cacheKey) videoInfoCache.set(cacheKey, videoInfo);
  return videoInfo;
}

export async function extractStreamUrl(
  url: string,
  options: {
    cookies?: string;
    signal?: AbortSignal;
  } = {},
): Promise<StreamInfo> {
  const isYouTube = isYoutubeURL(url);
  const formatSelector = "bestaudio[acodec^=mp4a]/bestaudio/best";

  const cacheKey = isYouTube ? buildStreamCacheKey(url) : undefined;
  if (cacheKey) {
    const cached = streamUrlCache.get(cacheKey);
    if (cached) return cached;
  }

  const args = [
    "--print",
    "url",
    "--print",
    "duration",
    "--print",
    "title",
    "--print",
    "thumbnail",
    "--print",
    "uploader",
    "--print",
    "artist",
    "--print",
    "album",
    ...(formatSelector ? ["--format", formatSelector] : []),
    url,
  ];

  const result = await executeYtDlp({
    target: url,
    youtube: isYouTube,
    cookies: options.cookies,
    args,
    fast: true,
    signal: options.signal,
  });

  throwIfFailed(result);

  const lines = result.stdout.trim().split("\n").filter(Boolean);
  if (lines.length < 5) {
    throw new Error("Incomplete stream information from yt-dlp.");
  }

  const streamUrl = lines[0];
  const duration = Math.floor(Number(lines[1]) || 0);
  const title = lines[2] && lines[2] !== "NA" ? lines[2] : "";
  const thumbnail = lines[3] && lines[3] !== "NA" ? lines[3] : "";
  const uploader = lines[4] && lines[4] !== "NA" ? lines[4] : "";
  const artist = lines[5] && lines[5] !== "NA" ? lines[5] : undefined;
  const album = lines[6] && lines[6] !== "NA" ? lines[6] : undefined;

  const contentType = guessContentTypeFromUrl(streamUrl);

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };

  const streamInfo: StreamInfo = {
    url: streamUrl,
    contentType,
    headers,
    duration,
    title,
    author: artist || uploader,
    ...(artist && { artist }),
    ...(album && { album }),
    thumbnail,
    sourceUrl: url,
  };

  if (cacheKey) streamUrlCache.set(cacheKey, streamInfo);
  return streamInfo;
}

async function executeYtDlp(options: ExecuteOptions): Promise<ExecuteResult> {
  const { path: cookiePath, isTemp } = await resolveCookiePath(options.cookies);
  const args = buildArgs(options, cookiePath);

  try {
    return await infoSemaphore.runExclusive(() => executeWithRetries(args, options));
  } finally {
    if (isTemp) await cleanupTempCookies(cookiePath);
  }
}

function buildArgs(options: ExecuteOptions, cookiePath: string | null): string[] {
  return [
    ...(cookiePath ? ["--cookies", cookiePath] : []),
    ...(options.fast ? FAST_ARGS : BASE_ARGS),
    ...(options.youtube ? (options.fast ? FAST_YOUTUBE_ARGS : YOUTUBE_ARGS) : []),
    ...options.args,
  ];
}

async function executeWithRetries(
  args: string[],
  handlers: Pick<ExecuteOptions, "onStdout" | "onStderr" | "signal">,
): Promise<ExecuteResult> {
  for (let attempt = 0; attempt <= PROCESS_RETRIES; attempt++) {
    if (handlers.signal?.aborted) {
      throw new DOMException("Download cancelled", "AbortError");
    }

    const result = await spawnYtDlp(args, handlers);
    if (result.code === 0) return result;

    if (attempt === PROCESS_RETRIES || !isRetryableError(result.stderr)) {
      console.error(
        `[Moonlit] yt-dlp failed with code ${result.code} (attempt ${attempt + 1}/${PROCESS_RETRIES + 1})`,
      );
      console.error("[Moonlit] stderr:", result.stderr);
      return result;
    }

    const delay = PROCESS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    console.warn(
      `[Moonlit] yt-dlp retryable error (attempt ${attempt + 1}), retrying in ${delay}ms...`,
    );
    await sleep(delay);
  }

  return { code: 1, stdout: "", stderr: "Unexpected yt-dlp retry state" };
}

async function spawnYtDlp(
  args: string[],
  handlers: Pick<ExecuteOptions, "onStdout" | "onStderr" | "signal">,
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";

    const abortYtDlp = () => {
      proc.kill();
      reject(new DOMException("Download cancelled", "AbortError"));
    };

    if (handlers.signal) {
      if (handlers.signal.aborted) {
        proc.kill();
        reject(new DOMException("Download cancelled", "AbortError"));
        return;
      }
      handlers.signal.addEventListener("abort", abortYtDlp, { once: true });
    }

    proc.stdout.on("data", (data) => {
      const str = data.toString();
      stdout += str;
      handlers.onStdout?.(str);
    });

    proc.stderr.on("data", (data) => {
      const str = data.toString();
      stderr += str;
      handlers.onStderr?.(str);
    });

    proc.on("close", (code) => {
      handlers.signal?.removeEventListener("abort", abortYtDlp);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    proc.on("error", (error) => {
      handlers.signal?.removeEventListener("abort", abortYtDlp);
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
}

async function resolveCookiePath(
  userCookies?: string,
): Promise<{ path: string | null; isTemp: boolean }> {
  if (userCookies?.trim()) {
    return { path: await writeTempCookies(userCookies), isTemp: true };
  }
  if (hasSystemCookies()) return { path: SYSTEM_COOKIES_PATH, isTemp: false };
  return { path: null, isTemp: false };
}

async function writeTempCookies(cookies: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moonlit-cookies-"));
  const cookiePath = path.join(tmpDir, "cookies.txt");
  const normalized = cookies.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  await fs.writeFile(cookiePath, normalized, "utf-8");
  return cookiePath;
}

async function cleanupTempCookies(cookiePath: string | null): Promise<void> {
  if (!cookiePath) return;
  try {
    await fs.unlink(cookiePath);
    await fs.rmdir(path.dirname(cookiePath));
  } catch {}
}

function parseVideoInfoJson(stdout: string): VideoInfo {
  try {
    const info = JSON.parse(stdout) as Record<string, unknown>;
    const artist = parseArtist(info);
    const uploader = getString(info.uploader) || getString(info.channel) || "";
    const title = getString(info.track) || getString(info.title) || "";
    const album = getString(info.album);

    return {
      title,
      author: artist || uploader,
      ...(artist && { artist }),
      ...(album && { album }),
      thumbnail: getString(info.thumbnail) || "",
      lengthSeconds: Math.floor(Number(info.duration) || 0),
    };
  } catch {
    throw new Error("Failed to parse video information.");
  }
}

function parseSearchJson(stdout: string): YouTubeSearchResult[] {
  try {
    const info = JSON.parse(stdout) as Record<string, unknown>;
    if (!Array.isArray(info.entries)) {
      const entry = parseSearchEntry(info);
      return entry ? [entry] : [];
    }

    return info.entries
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object",
      )
      .map(parseSearchEntry)
      .filter((entry): entry is YouTubeSearchResult => Boolean(entry));
  } catch {
    throw new Error("Failed to parse YouTube search results.");
  }
}

function parseSearchEntry(entry: Record<string, unknown>): YouTubeSearchResult | null {
  const id = getString(entry.id);
  const title = getString(entry.title);
  if (!id || !title) return null;

  return {
    id,
    title,
    url: getString(entry.webpage_url) || `https://www.youtube.com/watch?v=${id}`,
    author: getString(entry.uploader) || getString(entry.channel) || "YouTube",
    thumbnail: pickFlatPlaylistThumbnail(entry, id),
    lengthSeconds: Math.floor(Number(entry.duration) || 0),
    ...(Number.isFinite(Number(entry.view_count)) && {
      viewCount: Number(entry.view_count),
    }),
    ...(typeof entry.is_live === "boolean" && { isLive: entry.is_live }),
  };
}

function parseArtist(info: Record<string, unknown>): string | undefined {
  const artists = info.artists;
  if (Array.isArray(artists) && artists.length > 0) {
    return artists.map((a) => (typeof a === "string" ? a : String(a))).join(", ");
  }
  return getString(info.artist);
}

function pickFlatPlaylistThumbnail(entry: Record<string, unknown>, id: string): string {
  const thumbnail = getString(entry.thumbnail);
  if (thumbnail) return thumbnail;

  const thumbs = entry.thumbnails;
  if (!Array.isArray(thumbs) || thumbs.length === 0) {
    return defaultYoutubeThumbnail(id);
  }

  let bestNonMax = "";
  let bestNonMaxW = -1;
  let bestUrl = "";
  let bestW = -1;

  for (const row of thumbs) {
    if (!row || typeof row !== "object") continue;
    const thumb = row as { url?: string; width?: number };
    const url = getString(thumb.url);
    const width = Number(thumb.width) || 0;
    if (!url) continue;

    if (width >= bestW) {
      bestW = width;
      bestUrl = url;
    }
    if (!isMaxResThumbnail(url) && width >= bestNonMaxW) {
      bestNonMaxW = width;
      bestNonMax = url;
    }
  }

  return bestNonMax || bestUrl || defaultYoutubeThumbnail(id);
}

function throwIfFailed(result: ExecuteResult): void {
  if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));
}

function parseYtDlpError(stderr: string): string {
  const lower = stderr.toLowerCase();
  const rule = ERROR_RULES.find((r) => r.patterns.some((p) => lower.includes(p)));
  if (rule) return rule.message;

  const raw = stderr.match(/ERROR:\s*(.+)/i)?.[1]?.trim();
  if (raw) return raw.length > 200 ? `${raw.substring(0, 200)}...` : raw;

  console.error("[Moonlit] Unknown yt-dlp error:", stderr);
  return "Failed to process the video. Please check the URL and try again.";
}

function isRetryableError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return RETRYABLE_PATTERNS.some((pattern) => lower.includes(pattern));
}

function getFormatSelector(): string {
  return "bestaudio[acodec^=mp4a]/bestaudio/best";
}

function buildStreamCacheKey(url: string): string {
  return `stream:${url}:a:${getSystemCookieCacheKey()}`;
}

function guessContentTypeFromUrl(streamUrl: string): string {
  try {
    const parsed = new URL(streamUrl);
    const pathname = parsed.pathname.toLowerCase();
    const mimeParam = parsed.searchParams.get("mime") || "";
    if (
      pathname.includes(".m4a") ||
      pathname.includes("/m4a") ||
      mimeParam.includes("audio/mp4")
    )
      return "audio/mp4";
    if (pathname.includes(".mp3") || mimeParam.includes("audio/mpeg"))
      return "audio/mpeg";
    if (pathname.includes(".webm") || mimeParam.includes("audio/webm"))
      return "audio/webm";
    if (pathname.includes(".opus") || mimeParam.includes("opus")) return "audio/ogg";
    if (mimeParam.includes("audio/")) return mimeParam;
  } catch {}
  return "audio/mp4";
}

function cookieCacheKey(base: string, cookies?: string): string {
  if (!cookies?.trim()) {
    return `${base}::${getSystemCookieCacheKey()}`;
  }
  return `${base}::user:${simpleHash(cookies)}`;
}

function getSystemCookieCacheKey(): string {
  if (!hasSystemCookies()) return "nocookies";
  try {
    return `system:${statSync(SYSTEM_COOKIES_PATH).mtimeMs}`;
  } catch {
    return "system";
  }
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

function isYtSearchVideoRow(entry: YouTubeSearchResult): boolean {
  if (entry.lengthSeconds <= 0) return false;
  return /^[\w-]{11}$/.test(entry.id);
}

function getString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isMaxResThumbnail(url: string): boolean {
  return /maxres(default)?\.jpg|\/maxres\.jpg/i.test(url);
}

function defaultYoutubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
