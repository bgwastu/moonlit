import {
  downloadAudio,
  DownloadProgress,
  downloadVideo,
  getVideoInfo,
} from "@/lib/yt-dlp";
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

        let buffer: Buffer;
        let contentType: string;

        if (videoMode) {
          buffer = await downloadVideo(url, {
            cookies,
            onProgress,
            quality:
              quality || (videoInfo.lengthSeconds < 600 ? "high" : "low"),
          });
          contentType = "video/mp4";
        } else {
          buffer = await downloadAudio(url, { cookies, onProgress });
          contentType = "audio/mpeg";
        }

        // Convert buffer to base64 for SSE transmission
        const base64 = buffer.toString("base64");

        send({
          type: "complete",
          contentType,
          data: base64,
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
