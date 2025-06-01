import { getAudioStream, getVideoInfo } from "@/lib/yt";
import { isYoutubeURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 10000;

export async function POST(req: Request) {
  const { url, metadataOnly } = await req.json();

  if (!isYoutubeURL(url)) {
    return NextResponse.json({ message: "Invalid YouTube URL", status: 400 });
  }

  try {
    const videoInfo = await getVideoInfo(url);

    // Clean up title and author for consistent use
    const title = videoInfo.title
      .replace(/ \(Official Music Video\)/gi, "")
      .replace(/ \[Official Music Video\]/gi, "")
      .replace(/ (Lyric Video)/gi, "") // Added more common patterns
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
        "Content-Type": "application/json", // Ensure correct content type for JSON response
        Title: encodeURI(title),
        Author: encodeURI(author),
        Thumbnail: encodeURI(videoInfo.thumbnail) || "",
        LengthSeconds: videoInfo.lengthSeconds.toString(),
      };
      // Return only metadata as JSON. We are sending it in headers for client-side convenience for now.
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
      return NextResponse.json(
        {
          message: "Error when converting stream",
        },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        message: "Error when fetching video info",
      },
      { status: 500 }
    );
  }
}
