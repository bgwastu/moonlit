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

    // For TikTok, only remove hashtags from title
    const title = videoInfo.title
      .replace(/#\w+/g, "")
      .trim();

    const author = videoInfo.author
      .replace(/ - Topic$/i, "")
      .replace(/VEVO$/i, "")
      .trim();

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
        const buffer = await getVideoStream(url);
        const headers = {
          "Content-Type": "video/mp4",
          "Content-Length": buffer.byteLength.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
        };
        return new Response(buffer, { headers });
      } else {
        // Original audio-only mode
        const buffer = await getAudioStream(url);
        const headers = {
          "Content-Type": "audio/mpeg",
          "Content-Length": buffer.byteLength.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
        };
        return new Response(buffer, { headers });
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