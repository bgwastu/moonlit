import { getDownloadUrl } from "@/lib/yt";
import { isYoutubeURL } from "@/utils";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/videos";

export async function POST(req: Request) {
  const { url } = await req.json();

  if (!isYoutubeURL(url)) {
    return NextResponse.json({ message: "Invalid YouTube URL", status: 400 });
  }

  const videoId = new URL(url).searchParams.get("v");
  if (!videoId) {
    return NextResponse.json({ message: "Invalid YouTube URL", status: 400 });
  }

  try {
    const response = await fetch(
      `${YOUTUBE_API_URL}?id=${videoId}&part=snippet,contentDetails&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();

    if (!response.ok || !data.items || data.items.length === 0) {
      return NextResponse.json(
        {
          message: "Video is not available",
        },
        {
          status: 400,
        }
      );
    }

    const videoDetails = data.items[0];
    const duration = videoDetails.contentDetails.duration;
    const lengthSeconds = parseDuration(duration);

    if (lengthSeconds > 1800) {
      return NextResponse.json(
        {
          message: "The video is too long. The maximum length is 30 minutes",
        },
        {
          status: 400,
        }
      );
    }

    const title = videoDetails.snippet.title
      .replace(" (Official Music Video)", "")
      .replace(" [Official Music Video]", "")
      .replace("", "");

    const author = videoDetails.snippet.channelTitle
      .replace(" - Topic", "")
      .replace("VEVO", "");

    try {
      const downloadUrl = await getDownloadUrl(url);
      const response = await fetch(downloadUrl);
      const buffer = await response.arrayBuffer();

      const headers = {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.byteLength.toString(),
        Title: encodeURI(title),
        Author: encodeURI(author),
        Thumbnail: encodeURI(videoDetails.snippet.thumbnails.default.url) || "",
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

function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  const hours = (parseInt(match[1]) || 0) * 3600;
  const minutes = (parseInt(match[2]) || 0) * 60;
  const seconds = parseInt(match[3]) || 0;
  return hours + minutes + seconds;
}
