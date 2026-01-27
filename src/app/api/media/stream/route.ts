import {
  downloadAudioToFile,
  DownloadProgress,
  downloadVideoToFile,
  getVideoInfo,
} from "@/lib/yt-dlp";
import crypto from "crypto";
import { isTikTokURL } from "@/utils";

export async function POST(req: Request) {
  const {
    url,
    cookies,
    videoMode: requestedVideoMode,
    quality,
  } = await req.json();

  const encoder = new TextEncoder();
  const isTikTok = isTikTokURL(url);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Determine video mode and quality
        let videoMode: boolean;
        let finalQuality: "high" | "low" = quality;

        // If we have both videoMode and quality, we can skip the initial metadata fetch!
        if (typeof requestedVideoMode === "boolean" && quality) {
          videoMode = requestedVideoMode;
        } else {
          // Fallback: We need metadata to make decisions
          send({ type: "status", message: "Checking video info..." });
          const videoInfo = await getVideoInfo(url, cookies);

          if (typeof requestedVideoMode === "boolean") {
            videoMode = requestedVideoMode;
          } else {
            // Default: TikTok always video, YouTube video for short content
            videoMode = isTikTok || videoInfo.lengthSeconds < 600;
          }

          if (!finalQuality) {
            finalQuality = videoInfo.lengthSeconds < 600 ? "high" : "low";
          }
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

        if (videoMode) {
          const result = await downloadVideoToFile(url, {
            cookies,
            onProgress,
            quality: finalQuality,
          });
          filePath = result.filePath;
          folderPath = result.folderPath;
          contentType = "video/mp4";
        } else {
          const result = await downloadAudioToFile(url, {
            cookies,
            onProgress,
          });
          filePath = result.filePath;
          folderPath = result.folderPath;
          contentType = "audio/mpeg";
        }

        // Move file to a stable temp location
        const { promises: fs } = await import("fs");
        const path = await import("path");
        const { getTempDir } = await import("@/utils/server");

        const mediaDir = path.default.join(getTempDir(), "moonlit-media");
        await fs.mkdir(mediaDir, { recursive: true });

        const fileId = crypto.randomUUID();
        const targetPath = path.default.join(mediaDir, fileId);

        await fs.rename(filePath, targetPath);

        // Cleanup the original temp folder
        await fs.rmdir(folderPath).catch(() => {});

        // Send only download info - metadata comes from server-side page render
        send({
          type: "complete",
          contentType,
          downloadUrl: `/api/media/${fileId}`,
          videoMode,
        });

        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
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
