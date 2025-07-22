import { getAudioStream, getVideoInfo } from "@/lib/yt";
import { isTikTokURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 10000;

export async function POST(req: Request) {
  const { url, metadataOnly } = await req.json();

  if (!isTikTokURL(url)) {
    return NextResponse.json({ message: "Invalid TikTok URL", status: 400 });
  }

  try {
    const videoInfo = await getVideoInfo(url);

    // Clean up title and author for consistent use
    const title = videoInfo.title
      .replace(/ \(Official Music Video\)/gi, "")
      .replace(/ \[Official Music Video\]/gi, "")
      .replace(/ (Lyric Video)/gi, "")
      .replace(/ \[Lyric Video\]/gi, "")
      .replace(/ (Official Audio)/gi, "")
      .replace(/ \[Official Audio\]/gi, "")
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