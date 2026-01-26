import { downloadAudio, downloadVideo, getVideoInfo } from "@/lib/yt-dlp";
import { isTikTokURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 10000;

export async function POST(req: Request) {
  const { url, metadataOnly, videoMode } = await req.json();

  if (!isTikTokURL(url)) {
    return NextResponse.json(
      { message: "Invalid TikTok URL" },
      { status: 400 },
    );
  }

  try {
    const videoInfo = await getVideoInfo(url);

    // Remove hashtags from title
    const title = videoInfo.title.replace(/#\w+/g, "").trim();
    const author = videoInfo.author.trim();

    if (metadataOnly) {
      return NextResponse.json({
        title,
        author,
        thumbnail: videoInfo.thumbnail,
        lengthSeconds: videoInfo.lengthSeconds,
      });
    }

    if (videoInfo.lengthSeconds > 1800) {
      return NextResponse.json(
        { message: "The video is too long. The maximum length is 30 minutes" },
        { status: 400 },
      );
    }

    try {
      if (videoMode) {
        // Download video - use simpler format for TikTok (already browser-compatible)
        const buffer = await downloadVideo(url, {
          format: "best[ext=mp4]/best",
        });
        const uint8Array = new Uint8Array(buffer);
        const headers = {
          "Content-Type": "video/mp4",
          "Content-Length": buffer.length.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
        };
        return new NextResponse(uint8Array, { headers });
      } else {
        // Audio-only mode
        const buffer = await downloadAudio(url);
        const uint8Array = new Uint8Array(buffer);
        const headers = {
          "Content-Type": "audio/mpeg",
          "Content-Length": buffer.length.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
        };
        return new NextResponse(uint8Array, { headers });
      }
    } catch (e) {
      console.error("[Moonlit] TikTok download error:", e);
      const errorMessage =
        e instanceof Error ? e.message : "Error when converting stream";
      return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
  } catch (e) {
    console.error("[Moonlit] TikTok info error:", e);
    const errorMessage =
      e instanceof Error ? e.message : "Error when fetching video info";
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
