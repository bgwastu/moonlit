import { getAudioStream, getVideoInfo, getVideoStream } from "@/lib/yt";
import { isTikTokURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 10000;

export async function POST(req: Request) {
  const { url, metadataOnly, videoMode } = await req.json();

  if (!isTikTokURL(url)) {
    return NextResponse.json({ message: "Invalid TikTok URL", status: 400 });
  }

  try {
    const videoInfo = await getVideoInfo(url);

    // Remove hashtags from title
    const title = videoInfo.title
      .replace(/#\w+/g, "")
      .trim();

    const author = videoInfo.author.trim();

    if (metadataOnly) {
      const headers = {
        "Content-Type": "application/json",
        Title: encodeURI(title),
        Author: encodeURI(author),
        Thumbnail: encodeURI(videoInfo.thumbnail) || "",
        LengthSeconds: videoInfo.lengthSeconds.toString(),
      };
      return new Response(JSON.stringify({ title, author, thumbnail: videoInfo.thumbnail, lengthSeconds: videoInfo.lengthSeconds }), { headers });
    }

    if (videoInfo.lengthSeconds > 1800) {
      return NextResponse.json(
        {
          message: "The video is too long. The maximum length is 30 minutes",
        },
        {
          status: 400,
        }
      );
    }

    try {
      if (videoMode) {
        // Download video buffer and stream it directly (like audio)
        // Use simpler format selector for TikTok (videos are already browser-compatible)
        const buffer = await getVideoStream(url, 'best[ext=mp4]/best');
        // Convert Buffer to Uint8Array for compatibility with Web API
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
        // Original audio-only mode
        const buffer = await getAudioStream(url);
        // Convert Buffer to Uint8Array for compatibility with Web API
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
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : "Error when converting stream";
      return NextResponse.json(
        {
          message: errorMessage,
        },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : "Error when fetching video info";
    return NextResponse.json(
      {
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}