import { getAudioStream, getVideoInfo } from "@/lib/yt";
import { isYoutubeURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { url } = await req.json();

  if (!isYoutubeURL(url)) {
    return NextResponse.json({ message: "Invalid YouTube URL", status: 400 });
  }

  try {
    // Get video info first to check duration and get metadata
    const videoInfo = await getVideoInfo(url);

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
      const audioStream = await getAudioStream(url);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Clean up title and author
      const title = videoInfo.title
        .replace(" (Official Music Video)", "")
        .replace(" [Official Music Video]", "")
        .replace("", "");

      const author = videoInfo.author
        .replace(" - Topic", "")
        .replace("VEVO", "");

      const headers = {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.byteLength.toString(),
        Title: encodeURI(title),
        Author: encodeURI(author),
        Thumbnail: encodeURI(videoInfo.thumbnail) || "",
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
