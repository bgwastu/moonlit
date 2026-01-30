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

  const errorMatch = stderr.match(/ERROR:\s*(.+)/i);
  if (errorMatch) {
    const raw = errorMatch[1].trim();
    return raw.length > 200 ? raw.substring(0, 200) + "..." : raw;
  }

  console.error("[Moonlit] Unknown yt-dlp error:", stderr);
  return "Failed to process the video. Please check the URL and try again.";
}

function hasSystemCookies(): boolean {
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

  try {
    const args = [
      "--merge-output-format",
      "mp4",
      "--output",
      outputTemplate,
      "--no-playlist",
      "--newline",
      url,
    ];
    if (format) args.unshift("--format", format);

    const result = await executeYtDlp({
      args,
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
  const args = ["--get-url", "--no-playlist", url];

  if (isYoutubeURL(url)) {
    args.unshift(
      "--format",
      "best[height<=480][vcodec^=avc][acodec^=mp4a]/bestvideo[height<=480][vcodec^=avc]+bestaudio[acodec^=mp4a]/best[height<=480]",
    );
  }

  const result = await executeYtDlp({ args, cookies });

  if (result.code !== 0) throw new Error(parseYtDlpError(result.stderr));

  const videoUrl = result.stdout.trim();
  if (!videoUrl) throw new Error("Failed to get video URL");

  return videoUrl;
}
