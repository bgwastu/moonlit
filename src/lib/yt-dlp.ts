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

const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

/** Parse yt-dlp stderr into user-friendly error message */
function parseYtDlpError(stderr: string): string {
  const lower = stderr.toLowerCase();

  if (
    lower.includes("private") ||
    lower.includes("video unavailable") ||
    lower.includes("video is private")
  ) {
    return "This video is private or unavailable.";
  }
  if (lower.includes("age-restricted") || lower.includes("sign in to confirm your age")) {
    return "This content is age-restricted. Try configuring cookies from a logged-in account.";
  }
  if (lower.includes("geo") || lower.includes("not available in your country")) {
    return "This content is not available in your region.";
  }
  if (
    lower.includes("not a bot") ||
    lower.includes("confirm you're not a bot") ||
    lower.includes("confirm you’re not a bot")
  ) {
    return "YouTube asked for verification (often labeled as a bot check). Add cookies via Moonlit cookie settings from the homepage, export server cookies (`data/cookies.txt`), or use `--cookies-from-browser` on yt-dlp if you administer the host.";
  }
  if (
    lower.includes("login required") ||
    lower.includes("sign in") ||
    lower.includes("members only")
  ) {
    return "This content requires login. Try configuring cookies from a logged-in account.";
  }
  if (
    lower.includes("rate-limit") ||
    lower.includes("captcha") ||
    lower.includes("too many requests")
  ) {
    return "Rate limited. Please wait and try again, or use cookies.";
  }
  if (lower.includes("drm") || lower.includes("protected content")) {
    return "This content is DRM protected and cannot be downloaded.";
  }
  if (lower.includes("http error 404") || lower.includes("video not found")) {
    return "Content not found.";
  }
  if (lower.includes("http error 403") || lower.includes("forbidden")) {
    return "Access forbidden.";
  }
  if (
    lower.includes("connection") ||
    lower.includes("timed out") ||
    lower.includes("network")
  ) {
    return "Network error. Please try again.";
  }
  if (lower.includes("unsupported url") || lower.includes("no video formats found")) {
    return "Unsupported URL.";
  }
  if (
    lower.includes("live") ||
    lower.includes("premiere") ||
    lower.includes("upcoming")
  ) {
    return "Live streams and premieres cannot be downloaded.";
  }
  if (
    lower.includes("signature solving failed") ||
    lower.includes("sig function possibilities") ||
    lower.includes("challenge solving failed")
  ) {
    return "YouTube challenge solving failed. Update yt-dlp (and yt-dlp-ejs) on the host/container and try again.";
  }
  if (
    lower.includes("requested format is not available") ||
    lower.includes("only images are available")
  ) {
    return "Requested format is not available.";
  }

  const errorMatch = stderr.match(/ERROR:\s*(.+)/i);
  if (errorMatch) {
    const raw = errorMatch[1].trim();
    return raw.length > 200 ? raw.substring(0, 200) + "..." : raw;
  }

  console.error("[Moonlit] Unknown yt-dlp error:", stderr);
  return "Failed to process the video. Please check the URL and try again.";
}

/** True when `data/cookies.txt` exists and is non-empty (Docker volume / admin). */
export function hasSystemCookies(): boolean {
  try {
    if (existsSync(SYSTEM_COOKIES_PATH)) {
      const content = readFileSync(SYSTEM_COOKIES_PATH, "utf-8");
      return content?.trim().length > 0;
    }
  } catch {}
  return false;
}

async function writeTempCookies(cookies?: string): Promise<string | null> {
  if (!cookies?.trim()) return null;

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

async function resolveCookiePath(
  userCookies?: string,
): Promise<{ path: string | null; isTemp: boolean }> {
  if (userCookies?.trim()) {
    const tempPath = await writeTempCookies(userCookies);
    return { path: tempPath, isTemp: true };
  }
  if (hasSystemCookies()) {
    return { path: SYSTEM_COOKIES_PATH, isTemp: false };
  }
  return { path: null, isTemp: false };
}

interface ExecuteOptions {
  args: string[];
  cookies?: string;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

interface ExecuteResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function executeYtDlp(options: ExecuteOptions): Promise<ExecuteResult> {
  const { args, cookies, onStdout, onStderr } = options;
  const finalArgs = [...args];
  const { path: cookiePath, isTemp } = await resolveCookiePath(cookies);

  try {
    if (cookiePath) finalArgs.unshift("--cookies", cookiePath);
    if (process.env.PROXY) finalArgs.unshift("--proxy", process.env.PROXY);

    return await new Promise((resolve, reject) => {
      const proc = spawn("yt-dlp", finalArgs);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        const str = data.toString();
        stdout += str;
        onStdout?.(str);
      });

      proc.stderr.on("data", (data) => {
        const str = data.toString();
        stderr += str;
        onStderr?.(str);
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          console.error("[Moonlit] yt-dlp failed with code", code);
          console.error("[Moonlit] stderr:", stderr);
        }
        resolve({ code: code ?? 1, stdout, stderr });
      });

      proc.on("error", (error) => {
        reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
      });
    });
  } finally {
    if (isTemp) await cleanupTempCookies(cookiePath);
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
  if (simpleMatch) {
    return { status: "downloading", percent: parseFloat(simpleMatch[1]) };
  }

  if (
    line.includes("[Merger]") ||
    line.includes("[ffmpeg]") ||
    line.includes("[ExtractAudio]")
  ) {
    return { status: "processing", message: "Processing media..." };
  }

  return null;
}

/** Normalize artist from yt-dlp output (artists array or deprecated artist string) */
function parseArtist(info: Record<string, unknown>): string | undefined {
  const artists = info.artists;
  if (Array.isArray(artists) && artists.length > 0) {
    return artists.map((a) => (typeof a === "string" ? a : String(a))).join(", ");
  }
  const artist = info.artist;
  if (typeof artist === "string" && artist.trim()) return artist.trim();
  return undefined;
}

/** Prefer a non-maxres thumb when yt-dlp lists many sizes (search avoids maxres). */
function pickFlatPlaylistThumbnail(entry: Record<string, unknown>, id: string): string {
  if (typeof entry.thumbnail === "string" && entry.thumbnail.trim()) {
    return entry.thumbnail.trim();
  }
  const thumbs = entry.thumbnails;
  if (Array.isArray(thumbs) && thumbs.length > 0) {
    const isMaxResUrl = (u: string) => /maxres(default)?\.jpg|\/maxres\.jpg/i.test(u);
    let bestNonMax = "";
    let bestNonMaxW = -1;
    let bestUrl = "";
    let bestW = -1;
    for (const row of thumbs) {
      if (!row || typeof row !== "object") continue;
      const url = (row as { url?: string }).url;
      const w = Number((row as { width?: number }).width) || 0;
      if (typeof url !== "string" || !url) continue;
      if (w >= bestW) {
        bestW = w;
        bestUrl = url;
      }
      if (!isMaxResUrl(url) && w >= bestNonMaxW) {
        bestNonMaxW = w;
        bestNonMax = url;
      }
    }
    if (bestNonMax) return bestNonMax;
    if (bestUrl) return bestUrl;
    const first = thumbs[0] as { url?: string };
    if (typeof first?.url === "string" && first.url) return first.url;
  }
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function parseSearchEntry(entry: Record<string, unknown>): YouTubeSearchResult | null {
  const id = typeof entry.id === "string" ? entry.id : null;
  const title = typeof entry.title === "string" ? entry.title : null;

  if (!id || !title) return null;

  return {
    id,
    url:
      (typeof entry.webpage_url === "string" && entry.webpage_url) ||
      `https://www.youtube.com/watch?v=${id}`,
    title,
    author:
      (typeof entry.uploader === "string" && entry.uploader) ||
      (typeof entry.channel === "string" && entry.channel) ||
      "YouTube",
    thumbnail: pickFlatPlaylistThumbnail(entry, id),
    lengthSeconds: Math.floor(Number(entry.duration) || 0),
    ...(Number.isFinite(Number(entry.view_count)) && {
      viewCount: Number(entry.view_count),
    }),
    ...(typeof entry.is_live === "boolean" && { isLive: entry.is_live }),
  };
}

/**
 * yt-search sometimes injects non-video rows (e.g. channel cards with UC… id, duration 0).
 * Real YouTube watch IDs are 11 chars; channels are typically 24+ and start with UC/HC.
 */
function isYtSearchVideoRow(e: YouTubeSearchResult): boolean {
  if (e.lengthSeconds <= 0) return false;
  return /^[\w-]{11}$/.test(e.id);
}

function parseSearchEntries(info: Record<string, unknown>): YouTubeSearchResult[] {
  if (Array.isArray(info.entries)) {
    return info.entries
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object",
      )
      .map(parseSearchEntry)
      .filter((entry): entry is YouTubeSearchResult => Boolean(entry));
  }

  const entry = parseSearchEntry(info);
  return entry ? [entry] : [];
}

/** YouTube search via yt-dlp (flat playlist). Use when Data API is unavailable or quota exhausted. */
export async function searchYouTube(
  query: string,
  options: { limit?: number; cookies?: string } = {},
): Promise<YouTubeSearchResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 10);
  const target = isYoutubeURL(cleanQuery) ? cleanQuery : `ytsearch${limit}:${cleanQuery}`;
  const result = await executeYtDlp({
    args: ["--skip-download", "--flat-playlist", "-J", "--no-playlist", target],
    cookies: options.cookies,
  });

  if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));

  try {
    const info = JSON.parse(result.stdout) as Record<string, unknown>;
    const rows = parseSearchEntries(info).filter(isYtSearchVideoRow);
    return rows.slice(0, isYoutubeURL(cleanQuery) ? 1 : limit);
  } catch {
    throw new Error("Failed to parse YouTube search results.");
  }
}

/** Get video metadata without downloading. For music (YouTube Music, etc.) extracts track, artist, album. */
export async function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo> {
  const result = await executeYtDlp({
    args: ["--skip-download", "-J", "--no-playlist", url],
    cookies,
  });

  if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));

  try {
    const info = JSON.parse(result.stdout) as Record<string, unknown>;
    const artist = parseArtist(info);
    const uploader = (info.uploader as string) || (info.channel as string) || "";

    // For music: prefer track as title; otherwise use video title
    const title =
      (typeof info.track === "string" && info.track.trim() ? info.track.trim() : null) ||
      (typeof info.title === "string" ? info.title : "") ||
      "";

    const author = artist || uploader;

    return {
      title,
      author,
      ...(artist && { artist }),
      ...(typeof info.album === "string" &&
        info.album.trim() && { album: info.album.trim() }),
      thumbnail: (typeof info.thumbnail === "string" ? info.thumbnail : "") || "",
      lengthSeconds: Math.floor(Number(info.duration) || 0),
    };
  } catch {
    throw new Error("Failed to parse video information.");
  }
}

function isFormatNotAvailableError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes("requested format is not available") ||
    lower.includes("only images are available")
  );
}

/** Download video to file. Caller must cleanup folderPath. */
export async function downloadVideoToFile(
  url: string,
  options: DownloadOptions = {},
): Promise<{ filePath: string; folderPath: string }> {
  const tmpDir = await fs.mkdtemp(path.join(getTempDir(), "moonlit-yt-"));
  const outputTemplate = path.join(tmpDir, "%(id)s.%(ext)s");
  const quality = options.quality || "low";

  let format = options.format;
  if (!format && isYoutubeURL(url)) {
    format =
      quality === "high"
        ? "bestvideo[height<=720][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=720][vcodec^=avc][acodec^=mp4a]"
        : "bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480][vcodec^=avc][acodec^=mp4a]";
  }

  const runDownload = async (fmt: string | undefined): Promise<ExecuteResult> => {
    const args = [
      "--merge-output-format",
      "mp4",
      "--output",
      outputTemplate,
      "--no-playlist",
      "--newline",
      url,
    ];
    if (fmt) args.unshift("--format", fmt);
    return executeYtDlp({
      args,
      cookies: options.cookies,
      onStdout: (data) => {
        for (const line of data.split("\n")) {
          const progress = parseProgress(line);
          if (progress) options.onProgress?.(progress);
        }
      },
    });
  };

  try {
    let result = await runDownload(format);

    // For YouTube, if strict format failed with "format not available", retry with looser format
    if (
      result.code !== 0 &&
      isYoutubeURL(url) &&
      format &&
      isFormatNotAvailableError(result.stderr)
    ) {
      const fallbackFormat =
        quality === "high" ? "best[height<=720]/best" : "best[height<=480]/best";
      result = await runDownload(fallbackFormat);
    }

    if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));

    const files = await fs.readdir(tmpDir);
    const mediaFile = files.find((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (!mediaFile) throw new Error("Failed to locate downloaded video file.");

    options.onProgress?.({ status: "finished" });
    return { filePath: path.join(tmpDir, mediaFile), folderPath: tmpDir };
  } catch (error) {
    try {
      if (existsSync(tmpDir)) {
        const files = await fs.readdir(tmpDir);
        await Promise.all(
          files.map((f) => fs.unlink(path.join(tmpDir, f)).catch(() => {})),
        );
        await fs.rmdir(tmpDir).catch(() => {});
      }
    } catch {}
    throw error;
  }
}

/** Download video and return as Buffer */
export async function downloadVideo(
  url: string,
  options: DownloadOptions = {},
): Promise<Buffer> {
  const { filePath, folderPath } = await downloadVideoToFile(url, options);

  try {
    return await fs.readFile(filePath);
  } finally {
    try {
      const files = await fs.readdir(folderPath);
      await Promise.all(
        files.map((f) => fs.unlink(path.join(folderPath, f)).catch(() => {})),
      );
      await fs.rmdir(folderPath).catch(() => {});
    } catch {}
  }
}

/** Download audio to file. Caller must cleanup folderPath. */
export async function downloadAudioToFile(
  url: string,
  options: DownloadOptions = {},
): Promise<{ filePath: string; folderPath: string }> {
  const tmpDir = await fs.mkdtemp(path.join(getTempDir(), "moonlit-yt-"));
  const outputTemplate = path.join(tmpDir, "%(id)s.%(ext)s");

  try {
    const result = await executeYtDlp({
      args: [
        "--format",
        "bestaudio/best",
        "--output",
        outputTemplate,
        "--no-playlist",
        "--newline",
        url,
      ],
      cookies: options.cookies,
      onStdout: (data) => {
        for (const line of data.split("\n")) {
          const progress = parseProgress(line);
          if (progress) options.onProgress?.(progress);
        }
      },
    });

    if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));

    const files = await fs.readdir(tmpDir);
    const mediaFile = files.find((f) => !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (!mediaFile) throw new Error("Failed to locate downloaded audio file.");

    options.onProgress?.({ status: "finished" });
    return { filePath: path.join(tmpDir, mediaFile), folderPath: tmpDir };
  } catch (error) {
    try {
      if (existsSync(tmpDir)) {
        const files = await fs.readdir(tmpDir);
        await Promise.all(
          files.map((f) => fs.unlink(path.join(tmpDir, f)).catch(() => {})),
        );
        await fs.rmdir(tmpDir).catch(() => {});
      }
    } catch {}
    throw error;
  }
}

/** Download audio and return as Buffer */
export async function downloadAudio(
  url: string,
  options: DownloadOptions = {},
): Promise<Buffer> {
  const { filePath, folderPath } = await downloadAudioToFile(url, options);

  try {
    return await fs.readFile(filePath);
  } finally {
    try {
      const files = await fs.readdir(folderPath);
      await Promise.all(
        files.map((f) => fs.unlink(path.join(folderPath, f)).catch(() => {})),
      );
      await fs.rmdir(folderPath).catch(() => {});
    } catch {}
  }
}

/** Get direct video URL for streaming */
export async function getVideoUrl(url: string, cookies?: string): Promise<string> {
  const primaryFormat =
    "best[height<=480][vcodec^=avc][acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480]";
  const fallbackFormat = "best[height<=480]/best";

  let result: ExecuteResult;
  if (isYoutubeURL(url)) {
    result = await executeYtDlp({
      args: ["--format", primaryFormat, "--get-url", "--no-playlist", url],
      cookies,
    });
    if (result.code !== 0 && isFormatNotAvailableError(result.stderr)) {
      result = await executeYtDlp({
        args: ["--format", fallbackFormat, "--get-url", "--no-playlist", url],
        cookies,
      });
    }
  } else {
    result = await executeYtDlp({
      args: ["--get-url", "--no-playlist", url],
      cookies,
    });
  }

  if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));

  const videoUrl = result.stdout.trim();
  if (!videoUrl) throw new Error("Failed to get video URL");

  return videoUrl;
}
