import { getAudioStream, getVideoInfo, getVideoStream } from "@/lib/yt";
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
        VideoMode: videoInfo.lengthSeconds < 600 ? "true" : "false", // <10 minutes
      };
      return new Response(JSON.stringify({ 
        title, 
        author, 
        thumbnail: videoInfo.thumbnail, 
        lengthSeconds: videoInfo.lengthSeconds,
        videoMode: videoInfo.lengthSeconds < 600
      }), { headers });
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
      // For videos <10 minutes, download video
      if (videoInfo.lengthSeconds < 600) {
        const buffer = await getVideoStream(url);
        // Convert Buffer to Uint8Array for compatibility with Web API
        const uint8Array = new Uint8Array(buffer);
        const headers = {
          "Content-Type": "video/mp4",
          "Content-Length": buffer.length.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
          VideoMode: "true",
        };
        return new NextResponse(uint8Array, { headers });
      } else {
        // For videos ≥10 minutes, only provide audio
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
          VideoMode: "false",
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
