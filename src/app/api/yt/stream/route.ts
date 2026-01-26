import {
  downloadAudioToFile,
  DownloadProgress,
  downloadVideoToFile,
  getVideoInfo,
} from "@/lib/yt-dlp";
import crypto from "crypto";
import { isYoutubeURL } from "@/utils";

export const maxDuration = 10000;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const {
    url,
    cookies,
    videoMode: requestedVideoMode,
    quality,
  } = await req.json();

  if (!isYoutubeURL(url)) {
    return new Response(
      JSON.stringify({ type: "error", message: "Invalid YouTube URL" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Get video info first
        send({ type: "status", message: "Fetching video info..." });
        const videoInfo = await getVideoInfo(url, cookies);

        // Clean up metadata
        const title = videoInfo.title
          .replace(/ \(Official Music Video\)/gi, "")
          .replace(/ \[Official Music Video\]/gi, "")
          .replace(/ \(Lyric Video\)/gi, "")
          .replace(/ \[Lyric Video\]/gi, "")
          .replace(/ \(Official Audio\)/gi, "")
          .replace(/ \[Official Audio\]/gi, "")
          .trim();

        const author = videoInfo.author
          .replace(/ - Topic$/i, "")
          .replace(/VEVO$/i, "")
          .trim();

        let videoMode: boolean;
        if (typeof requestedVideoMode === "boolean") {
          videoMode = requestedVideoMode;
        } else {
          videoMode = videoInfo.lengthSeconds < 600;
        }

        // Send metadata
        send({
          type: "metadata",
          title,
          author,
          thumbnail: videoInfo.thumbnail,
          lengthSeconds: videoInfo.lengthSeconds,
          videoMode,
        });

        // Check duration limit
        if (videoInfo.lengthSeconds > 1800) {
          send({
            type: "error",
            message: "The video is too long. The maximum length is 30 minutes",
          });
          controller.close();
          return;
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
            quality:
              quality || (videoInfo.lengthSeconds < 600 ? "high" : "low"),
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

        send({
          type: "complete",
          contentType,
          downloadUrl: `/api/media/${fileId}`,
          title,
          author,
          thumbnail: videoInfo.thumbnail,
          lengthSeconds: videoInfo.lengthSeconds,
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
