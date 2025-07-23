import { getAudioStream, getVideoInfo, getVideoStream, getVideoUrl } from "@/lib/yt";
import { isYoutubeURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 10000;

export async function POST(req: Request) {
  const { url, metadataOnly, videoMode } = await req.json();

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
      // For videos <10 minutes, download video if requested or if it's short
      if (videoInfo.lengthSeconds < 600 && (videoMode || videoInfo.lengthSeconds < 600)) {
        const buffer = await getVideoStream(url);
        const headers = {
          "Content-Type": "video/mp4",
          "Content-Length": buffer.byteLength.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
          VideoMode: "true",
        };
        return new Response(buffer, { headers });
      } else if (videoInfo.lengthSeconds < 600) {
        // For short videos, provide video URL instead of streaming
        const videoUrl = await getVideoUrl(url);
        const headers = {
          "Content-Type": "application/json",
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
          VideoMode: "true",
          VideoUrl: encodeURI(videoUrl),
        };
        return new Response(JSON.stringify({ 
          title, 
          author, 
          thumbnail: videoInfo.thumbnail, 
          lengthSeconds: videoInfo.lengthSeconds,
          videoUrl: videoUrl,
          videoMode: true
        }), { headers });
      } else {
        // For videos ≥10 minutes, only provide audio
        const buffer = await getAudioStream(url);
        const headers = {
          "Content-Type": "audio/mpeg",
          "Content-Length": buffer.byteLength.toString(),
          Title: encodeURI(title),
          Author: encodeURI(author),
          Thumbnail: encodeURI(videoInfo.thumbnail) || "",
          LengthSeconds: videoInfo.lengthSeconds.toString(),
          VideoMode: "false",
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
