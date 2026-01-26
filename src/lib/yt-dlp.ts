import { spawn } from "child_process";
import { existsSync, readFileSync, promises as fs } from "fs";
import os from "os";
import path from "path";
import { getTempDir } from "@/utils/server";

// ============================================================================
// Types
// ============================================================================

export interface VideoInfo {
  title: string;
  author: string;
  thumbnail: string;
  lengthSeconds: number;
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
  cookies?: string; // User cookies content passed from client
  quality?: "high" | "low";
  onProgress?: (progress: DownloadProgress) => void;
}

// System cookies path (stored server-side)
const DATA_DIR = path.join(process.cwd(), "data");
const SYSTEM_COOKIES_PATH = path.join(DATA_DIR, "cookies.txt");

// ============================================================================
// Error Parsing - Based on real yt-dlp error messages
// ============================================================================

/**
 * Parse yt-dlp stderr and return a user-friendly error message.
 * Based on real ExtractorError subclasses from yt-dlp repository.
 * If no known pattern matches, returns the raw error.
 */
function parseYtDlpError(stderr: string): string {
  const lowerStderr = stderr.toLowerCase();

  // Private/Hidden videos
  if (
    lowerStderr.includes("private") ||
    lowerStderr.includes("video unavailable") ||
    lowerStderr.includes("this video is unavailable") ||
    lowerStderr.includes("video is private")
  ) {
    return "This video is private or unavailable. It may have been deleted or restricted.";
  }

  // Age-restricted content
  if (
    lowerStderr.includes("age-restricted") ||
    lowerStderr.includes("age restricted") ||
    lowerStderr.includes("age verification") ||
    lowerStderr.includes("sign in to confirm your age") ||
    lowerStderr.includes("older than 19")
  ) {
    return "This content is age-restricted. Try configuring cookies from a logged-in account.";
  }

  // Geo-restriction
  if (
    lowerStderr.includes("geo") ||
    lowerStderr.includes("not available in your country") ||
    lowerStderr.includes("not available from your location") ||
    lowerStderr.includes("geoblocked") ||
    lowerStderr.includes("available only for") ||
    lowerStderr.includes("uploader has not made this video available")
  ) {
    return "This content is not available in your region due to geo-restriction.";
  }

  // Login required
  if (
    lowerStderr.includes("login required") ||
    lowerStderr.includes("sign in") ||
    lowerStderr.includes("requires authentication") ||
    lowerStderr.includes("registered users") ||
    lowerStderr.includes("subscriber-only") ||
    lowerStderr.includes("members only") ||
    lowerStderr.includes("please subscribe")
  ) {
    return "This content requires login or subscription. Try configuring cookies from a logged-in account.";
  }

  // Rate limiting / Bot detection
  if (
    lowerStderr.includes("rate-limit") ||
    lowerStderr.includes("rate limit") ||
    lowerStderr.includes("too many requests") ||
    lowerStderr.includes("captcha") ||
    lowerStderr.includes("confirm you") ||
    lowerStderr.includes("unusual traffic")
  ) {
    return "Rate limited or captcha required. Please wait a moment and try again, or use cookies.";
  }

  // DRM protected
  if (
    lowerStderr.includes("drm") ||
    lowerStderr.includes("protected content") ||
    lowerStderr.includes("widevine") ||
    lowerStderr.includes("encrypted")
  ) {
    return "This content is DRM protected and cannot be downloaded.";
  }

  // Network errors
  if (
    lowerStderr.includes("http error 404") ||
    lowerStderr.includes("video not found") ||
    lowerStderr.includes("unable to download")
  ) {
    return "Content not found. The video may have been deleted or the URL is incorrect.";
  }

  if (
    lowerStderr.includes("http error 403") ||
    lowerStderr.includes("forbidden")
  ) {
    return "Access forbidden. This content may be private or restricted.";
  }

  if (
    lowerStderr.includes("connection") ||
    lowerStderr.includes("timed out") ||
    lowerStderr.includes("network")
  ) {
    return "Network error. Please check your connection and try again.";
  }

  // Unsupported URL
  if (
    lowerStderr.includes("unsupported url") ||
    lowerStderr.includes("no video formats found") ||
    lowerStderr.includes("unable to extract")
  ) {
    return "Unsupported URL or unable to extract video data.";
  }

  // Live content
  if (
    lowerStderr.includes("live") ||
    lowerStderr.includes("premiere") ||
    lowerStderr.includes("upcoming")
  ) {
    return "Live streams and premieres cannot be downloaded while in progress.";
  }

  // Extract the actual error line if present (usually starts with "ERROR:")
  const errorMatch = stderr.match(/ERROR:\s*(.+)/i);
  if (errorMatch) {
    const rawError = errorMatch[1].trim();
    return rawError.length > 200
      ? rawError.substring(0, 200) + "..."
      : rawError;
  }

  // Log unknown error for debugging
  console.error("[Moonlit] Unknown yt-dlp error:", stderr);

  // Return first meaningful line as fallback
  const lines = stderr.split("\n").filter((l) => l.trim());
  const firstError = lines.find(
    (l) => l.includes("ERROR") || l.includes("error"),
  );
  if (firstError) {
    return firstError.trim().substring(0, 200);
  }

  return "Failed to process the video. Please check the URL and try again.";
}

// ============================================================================
// Cookie Handling
// ============================================================================

/**
 * Check if system cookies are available
 */
function hasSystemCookies(): boolean {
  try {
    if (existsSync(SYSTEM_COOKIES_PATH)) {
      const content = readFileSync(SYSTEM_COOKIES_PATH, "utf-8");
      return content && content.trim().length > 0;
    }
  } catch {}
  return false;
}

/**
 * Write cookies to a temp file and return the path
 */
async function writeTempCookies(cookies?: string): Promise<string | null> {
  if (!cookies || !cookies.trim()) {
    return null;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "moonlit-cookies-"));
  const cookiePath = path.join(tmpDir, "cookies.txt");

  const normalized = cookies.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  await fs.writeFile(cookiePath, normalized, "utf-8");

  return cookiePath;
}

/**
 * Clean up temp cookie file
 */
async function cleanupTempCookies(cookiePath: string | null): Promise<void> {
  if (!cookiePath) return;
  try {
    await fs.unlink(cookiePath);
    await fs.rmdir(path.dirname(cookiePath));
  } catch {}
}

/**
 * Get the cookie path to use
 * Priority: User cookies (temp file) > System cookies > None
 */
async function resolveCookiePath(
  userCookies?: string,
): Promise<{ path: string | null; isTemp: boolean }> {
  // If user provided cookies, write to temp file
  if (userCookies && userCookies.trim()) {
    const tempPath = await writeTempCookies(userCookies);
    return { path: tempPath, isTemp: true };
  }

  // Fallback to system cookies if they exist
  if (hasSystemCookies()) {
    return { path: SYSTEM_COOKIES_PATH, isTemp: false };
  }

  return { path: null, isTemp: false };
}

// ============================================================================
// Core yt-dlp Execution
// ============================================================================

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

/**
 * Core function to execute yt-dlp with common configuration
 */
async function executeYtDlp(options: ExecuteOptions): Promise<ExecuteResult> {
  const { args, cookies, onStdout, onStderr } = options;

  const finalArgs = [...args];
  const { path: cookiePath, isTemp } = await resolveCookiePath(cookies);

  try {
    if (cookiePath) {
      finalArgs.unshift("--cookies", cookiePath);
    }

    if (process.env.PROXY) {
      finalArgs.unshift("--proxy", process.env.PROXY);
    }

    console.log("[Moonlit] Executing:", "yt-dlp", finalArgs.join(" "));

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
          console.error("[Moonlit] stdout:", stdout);
          console.error("[Moonlit] stderr:", stderr);
        }
        resolve({ code: code ?? 1, stdout, stderr });
      });

      proc.on("error", (error) => {
        reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
      });
    });
  } finally {
    if (isTemp) {
      await cleanupTempCookies(cookiePath);
    }
  }
}

// ============================================================================
// Progress Parsing
// ============================================================================

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
    return {
      status: "downloading",
      percent: parseFloat(simpleMatch[1]),
    };
  }

  if (
    line.includes("[Merger]") ||
    line.includes("[ffmpeg]") ||
    line.includes("[ExtractAudio]")
  ) {
    return {
      status: "processing",
      message: "Processing media...",
    };
  }

  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get video metadata without downloading
 */
export async function getVideoInfo(
  url: string,
  cookies?: string,
): Promise<VideoInfo> {
  const result = await executeYtDlp({
    args: ["--skip-download", "-J", "--no-playlist", url],
    cookies,
  });

  if (result.code !== 0) {
    throw new Error(parseYtDlpError(result.stderr));
  }

  try {
    const info = JSON.parse(result.stdout);
    return {
      title: info.title || "",
      author: info.uploader || info.channel || "",
      thumbnail: info.thumbnail || "",
      lengthSeconds: Math.floor(info.duration || 0),
    };
  } catch {
    throw new Error("Failed to parse video information. Please try again.");
  }
}

/**
 * Download video and return path to file
 * Caller is responsible for cleaning up the folderPath
 */
export async function downloadVideoToFile(
  url: string,
  options: DownloadOptions = {},
): Promise<{ filePath: string; folderPath: string }> {
  const tmpDir = await fs.mkdtemp(path.join(getTempDir(), "moonlit-yt-"));
  const outputTemplate = path.join(tmpDir, "%(id)s.%(ext)s");

  const quality = options.quality || "low";

  /* Check if TikTok */
  const isTikTok = url.includes("tiktok.com");

  let format = options.format;

  if (!format) {
    if (isTikTok) {
      format = "best[ext=mp4][height<=720]/best[height<=720]";
    } else {
      // YouTube / Default
      format =
        quality === "high"
          ? "bestvideo[height<=720][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=720][vcodec^=avc][acodec^=mp4a]"
          : "bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480][vcodec^=avc][acodec^=mp4a]";
    }
  }

  try {
    const result = await executeYtDlp({
      args: [
        "--format",
        format,
        "--merge-output-format",
        "mp4",
        "--output",
        outputTemplate,
        "--no-playlist",
        "--newline",
        url,
      ],
      cookies: options.cookies,
      onStdout: (data) => {
        const lines = data.split("\n");
        for (const line of lines) {
          const progress = parseProgress(line);
          if (progress) {
            options.onProgress?.(progress);
          }
        }
      },
    });

    if (result.code !== 0) {
      throw new Error(parseYtDlpError(result.stderr));
    }

    const files = await fs.readdir(tmpDir);
    const mediaFile = files.find(
      (f) => !f.endsWith(".part") && !f.endsWith(".ytdl"),
    );

    if (!mediaFile) {
      throw new Error("Failed to locate downloaded video file.");
    }

    const filePath = path.join(tmpDir, mediaFile);
    options.onProgress?.({ status: "finished" });

    return { filePath, folderPath: tmpDir };
  } catch (error) {
    // Cleanup on error
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

/**
 * Download video and return as Buffer
 */
export async function downloadVideo(
  url: string,
  options: DownloadOptions = {},
): Promise<Buffer> {
  const { filePath, folderPath } = await downloadVideoToFile(url, options);

  try {
    const buffer = await fs.readFile(filePath);
    return buffer;
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

/**
 * Download audio and return path to file
 * Caller is responsible for cleaning up the folderPath
 */
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
        const lines = data.split("\n");
        for (const line of lines) {
          const progress = parseProgress(line);
          if (progress) {
            options.onProgress?.(progress);
          }
        }
      },
    });

    if (result.code !== 0) {
      throw new Error(parseYtDlpError(result.stderr));
    }

    const files = await fs.readdir(tmpDir);
    const mediaFile = files.find(
      (f) => !f.endsWith(".part") && !f.endsWith(".ytdl"),
    );

    if (!mediaFile) {
      throw new Error("Failed to locate downloaded audio file.");
    }

    const filePath = path.join(tmpDir, mediaFile);
    options.onProgress?.({ status: "finished" });

    return { filePath, folderPath: tmpDir };
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

/**
 * Download audio only and return as Buffer
 */
export async function downloadAudio(
  url: string,
  options: DownloadOptions = {},
): Promise<Buffer> {
  const { filePath, folderPath } = await downloadAudioToFile(url, options);

  try {
    const buffer = await fs.readFile(filePath);
    return buffer;
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

/**
 * Get direct video URL (for streaming without download)
 */
export async function getVideoUrl(
  url: string,
  cookies?: string,
): Promise<string> {
  const result = await executeYtDlp({
    args: [
      "--format",
      "best[height<=480][vcodec^=avc][acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480]",
      "--get-url",
      "--no-playlist",
      url,
    ],
    cookies,
  });

  if (result.code !== 0) {
    throw new Error(parseYtDlpError(result.stderr));
  }

  const videoUrl = result.stdout.trim();
  if (!videoUrl) {
    throw new Error("Failed to get video URL");
  }

  return videoUrl;
}
