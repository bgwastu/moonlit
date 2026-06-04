import crypto from "crypto";
import { existsSync, promises as fs } from "fs";
import path from "path";
import {
  DownloadProgress,
  downloadAudioToFile,
  downloadVideoToFile,
  getContentType,
  getVideoInfo,
} from "@/lib/yt-dlp";
import { isTikTokURL } from "@/utils";
import { getTempDir } from "@/utils/server";

const MEDIA_DIR = path.join(getTempDir(), "moonlit-media");
const ABANDONED_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** Periodically remove abandoned media files older than TTL. */
function startAbandonedCleanup(): void {
  const sweep = async () => {
    try {
      if (!existsSync(MEDIA_DIR)) return;
      const now = Date.now();
      const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isFile()) return;
          const fp = path.join(MEDIA_DIR, entry.name);
          try {
            const stat = await fs.stat(fp);
            if (now - stat.mtimeMs > ABANDONED_TTL_MS) {
              await fs.unlink(fp);
            }
          } catch {}
        }),
      );
    } catch {}
  };
  sweep();
  setInterval(sweep, CLEANUP_INTERVAL_MS);
}
startAbandonedCleanup();

export async function POST(req: Request) {
  const {
    url,
    cookies,
    videoMode: requestedVideoMode,
    quality,
    preload,
  } = await req.json();

  const encoder = new TextEncoder();
  const isTikTok = isTikTokURL(url);
  const preloadMeta = preload?.metadata as
    | { title?: string; author?: string; coverUrl?: string }
    | undefined;
  const preloadDuration = preload?.duration as number | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may already be closed — ignore
        }
      };

      try {
        let videoMode: boolean;
        let finalQuality: "high" | "low" = quality;
        let videoTitle = "";
        let videoAuthor = "";
        let videoThumbnail = "";
        let lengthSeconds: number | undefined;

        // Use preloaded metadata when the page already fetched it
        if (preloadMeta?.title && preloadDuration != null) {
          videoTitle = preloadMeta.title;
          videoAuthor = preloadMeta.author ?? "";
          videoThumbnail = preloadMeta.coverUrl ?? "";
          lengthSeconds = preloadDuration;
        } else {
          send({ type: "status", message: "Checking video info..." });
          const videoInfo = await getVideoInfo(url, cookies);
          videoTitle = videoInfo.title;
          videoAuthor = videoInfo.author;
          videoThumbnail = videoInfo.thumbnail;
          lengthSeconds = videoInfo.lengthSeconds;
        }

        if (typeof requestedVideoMode === "boolean") {
          videoMode = requestedVideoMode;
        } else {
          videoMode = isTikTok || (lengthSeconds != null && lengthSeconds < 600);
        }

        if (!finalQuality) {
          finalQuality = lengthSeconds != null && lengthSeconds < 600 ? "high" : "low";
        }

        // Download with progress
        send({ type: "status", message: "Starting download..." });

        const onProgress = (progress: DownloadProgress) => {
          send({
            type: "progress",
            status: progress.status,
            percent: progress.percent,
            speed: progress.speed,
            eta: progress.eta,
            message: progress.message,
          });
        };

        let filePath: string;
        let folderPath: string;
        let contentType: string;

        const downloadOpts = {
          cookies,
          onProgress,
          quality: finalQuality,
          signal: req.signal,
        };

        if (videoMode) {
          const result = await downloadVideoToFile(url, downloadOpts);
          filePath = result.filePath;
          folderPath = result.folderPath;
          contentType = getContentType(filePath);
        } else {
          const result = await downloadAudioToFile(url, downloadOpts);
          filePath = result.filePath;
          folderPath = result.folderPath;
          contentType = getContentType(filePath);
        }

        // Move file to a stable temp location
        await fs.mkdir(MEDIA_DIR, { recursive: true });

        const fileId = crypto.randomUUID();
        const targetPath = path.join(MEDIA_DIR, fileId);

        await fs.rename(filePath, targetPath);

        // Cleanup the original temp folder
        await fs.rmdir(folderPath).catch(() => {});

        send({
          type: "complete",
          contentType,
          downloadUrl: `/api/media/${fileId}`,
          videoMode,
          title: videoTitle,
          author: videoAuthor,
          thumbnail: videoThumbnail,
        });

        controller.close();
      } catch (error) {
        // Silent abort — client disconnected
        if (error instanceof DOMException && error.name === "AbortError") {
          controller.close();
          return;
        }
        const message = error instanceof Error ? error.message : "Unknown error";
        send({ type: "error", message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
