import { spawn } from "child_process";
import { existsSync, promises as fs, readFileSync } from "fs";
import os from "os";
import path from "path";
import { isYoutubeURL } from "@/utils";
import { getTempDir } from "@/utils/server";

export interface VideoInfo {
  title: string;
  author: string;
  /** Artist(s) for music content (YouTube Music, etc.) */
  artist?: string;
  /** Album name for music content */
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

export interface DownloadProgress {
  status: "downloading" | "processing" | "finished" | "error";
  percent?: number;
  speed?: string;
  eta?: string;
  message?: string;
}

export interface DownloadOptions {
  format?: string;
  cookies?: string;
  quality?: "high" | "low";
  onProgress?: (progress: DownloadProgress) => void;
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
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

interface TempDownloadContext {
  dir: string;
  outputTemplate: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

const MAX_CONCURRENT_YTDLP = 2;
const PROCESS_RETRIES = 2;
const PROCESS_RETRY_BASE_DELAY_MS = 2000;
const VIDEO_INFO_TTL_MS = 5 * 60 * 1000;
const SEARCH_TTL_MS = 30 * 60 * 1000;

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

const YOUTUBE_ARGS = ["--extractor-args", "youtube:player_client=ios,web"];

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

const ytdlpSemaphore = new Semaphore(MAX_CONCURRENT_YTDLP);
const videoInfoCache = new TtlCache<VideoInfo>(VIDEO_INFO_TTL_MS);
const searchCache = new TtlCache<YouTubeSearchResult[]>(SEARCH_TTL_MS);

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
    patterns: ["not a bot", "confirm you're not a bot", "confirm you’re not a bot"],
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

/** True when `data/cookies.txt` exists and is non-empty (Docker volume / admin). */
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
  const cacheKey = `q=${cleanQuery}|limit=${limit}`;
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

/** Get video metadata without downloading. For music (YouTube Music, etc.) extracts track, artist, album. */
export async function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo> {
  const canCache = isYoutubeURL(url);
  const cached = canCache ? videoInfoCache.get(url) : undefined;
  if (cached) return cached;

  const result = await executeYtDlp({
    target: url,
    youtube: canCache,
    cookies,
    args: ["--skip-download", "-J", url],
  });

  throwIfFailed(result);

  const videoInfo = parseVideoInfoJson(result.stdout);
  if (canCache) videoInfoCache.set(url, videoInfo);
  return videoInfo;
}

/** Download video to file. Caller must cleanup folderPath. */
export async function downloadVideoToFile(
  url: string,
  options: DownloadOptions = {},
): Promise<{ filePath: string; folderPath: string }> {
  return withTempDownloadDir(async ({ dir, outputTemplate }) => {
    const quality = options.quality ?? "low";
    const preferredFormat = options.format ?? getDefaultVideoFormat(url, quality);
    let result = await runDownload({
      url,
      outputTemplate,
      format: preferredFormat,
      cookies: options.cookies,
      onProgress: options.onProgress,
      video: true,
    });

    if (
      result.code !== 0 &&
      isYoutubeURL(url) &&
      preferredFormat &&
      isFormatNotAvailableError(result.stderr)
    ) {
      result = await runDownload({
        url,
        outputTemplate,
        format: getFallbackVideoFormat(quality),
        cookies: options.cookies,
        onProgress: options.onProgress,
        video: true,
      });
    }

    throwIfFailed(result);
    options.onProgress?.({ status: "finished" });

    return { filePath: await findDownloadedMediaFile(dir), folderPath: dir };
  });
}

/** Download audio to file. Caller must cleanup folderPath. */
export async function downloadAudioToFile(
  url: string,
  options: DownloadOptions = {},
): Promise<{ filePath: string; folderPath: string }> {
  return withTempDownloadDir(async ({ dir, outputTemplate }) => {
    const result = await runDownload({
      url,
      outputTemplate,
      format: "bestaudio/best",
      cookies: options.cookies,
      onProgress: options.onProgress,
      video: false,
    });

    throwIfFailed(result);
    options.onProgress?.({ status: "finished" });

    return { filePath: await findDownloadedMediaFile(dir), folderPath: dir };
  });
}

async function runDownload(options: {
  url: string;
  outputTemplate: string;
  format: string | undefined;
  cookies?: string;
  onProgress?: (progress: DownloadProgress) => void;
  video: boolean;
}): Promise<ExecuteResult> {
  const args = [
    ...(options.format ? ["--format", options.format] : []),
    ...(options.video ? ["--merge-output-format", "mp4"] : []),
    "--output",
    options.outputTemplate,
    "--newline",
    options.url,
  ];

  return executeYtDlp({
    target: options.url,
    args,
    cookies: options.cookies,
    youtube: isYoutubeURL(options.url),
    onStdout: (data) => emitProgress(data, options.onProgress),
  });
}

async function executeYtDlp(options: ExecuteOptions): Promise<ExecuteResult> {
  const { path: cookiePath, isTemp } = await resolveCookiePath(options.cookies);
  const args = buildArgs(options, cookiePath);

  try {
    return await ytdlpSemaphore.runExclusive(() => executeWithRetries(args, options));
  } finally {
    if (isTemp) await cleanupTempCookies(cookiePath);
  }
}

function buildArgs(options: ExecuteOptions, cookiePath: string | null): string[] {
  return [
    ...(cookiePath ? ["--cookies", cookiePath] : []),
    ...BASE_ARGS,
    ...(options.youtube ? YOUTUBE_ARGS : []),
    ...options.args,
  ];
}

async function executeWithRetries(
  args: string[],
  handlers: Pick<ExecuteOptions, "onStdout" | "onStderr">,
): Promise<ExecuteResult> {
  for (let attempt = 0; attempt <= PROCESS_RETRIES; attempt++) {
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
  handlers: Pick<ExecuteOptions, "onStdout" | "onStderr">,
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";

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

    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on("error", (error) => {
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

async function withTempDownloadDir<T>(
  fn: (ctx: TempDownloadContext) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(getTempDir(), "moonlit-yt-"));
  try {
    return await fn({ dir, outputTemplate: path.join(dir, "%(id)s.%(ext)s") });
  } catch (error) {
    await cleanupDownloadDir(dir);
    throw error;
  }
}

async function cleanupDownloadDir(dir: string): Promise<void> {
  try {
    if (!existsSync(dir)) return;
    const files = await fs.readdir(dir);
    await Promise.all(files.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
    await fs.rmdir(dir).catch(() => {});
  } catch {}
}

async function findDownloadedMediaFile(dir: string): Promise<string> {
  const files = await fs.readdir(dir);
  const mediaFile = files.find((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
  if (!mediaFile) throw new Error("Failed to locate downloaded media file.");
  return path.join(dir, mediaFile);
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

function emitProgress(
  data: string,
  onProgress?: (progress: DownloadProgress) => void,
): void {
  if (!onProgress) return;
  for (const line of data.split("\n")) {
    const progress = parseProgress(line);
    if (progress) onProgress(progress);
  }
}

function parseProgress(line: string): DownloadProgress | null {
  const downloadMatch = line.match(
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s)\s+ETA\s+(\S+)/,
  );
  if (downloadMatch) {
    return {
      status: "downloading",
      percent: parseFloat(downloadMatch[1]),
      speed: downloadMatch[2],
      eta: downloadMatch[3],
    };
  }

  const simpleMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/);
  if (simpleMatch) return { status: "downloading", percent: parseFloat(simpleMatch[1]) };

  if (
    line.includes("[Merger]") ||
    line.includes("[ffmpeg]") ||
    line.includes("[ExtractAudio]")
  ) {
    return { status: "processing", message: "Processing media..." };
  }

  return null;
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

function isFormatNotAvailableError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("requested format is not available") ||
    lower.includes("only images are available")
  );
}

function getDefaultVideoFormat(url: string, quality: "high" | "low"): string | undefined {
  if (!isYoutubeURL(url)) return undefined;
  return quality === "high"
    ? "bestvideo[height<=720][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=720][vcodec^=avc][acodec^=mp4a]"
    : "bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480][vcodec^=avc][acodec^=mp4a]";
}

function getFallbackVideoFormat(quality: "high" | "low"): string {
  return quality === "high" ? "best[height<=720]/best" : "best[height<=480]/best";
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
