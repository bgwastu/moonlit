import { isYoutubeURL } from "@/utils";
import { NextResponse } from "next/server";
import * as ytdl from "ytdl-core";

export async function POST(req: Request) {
  const { url } = await req.json();

  if (!isYoutubeURL(url)) {
    return NextResponse.json({ message: "Invalid YouTube URL", status: 400 });
  }

  return ytdl
    .getInfo(url)
    .then((info) => {
      if (info.player_response.playabilityStatus.status !== "OK") {
        return NextResponse.json(
          {
            message: "Video is not available",
          },
          {
            status: 500,
          }
        );
      }

      // if the length of the video is more than 10 minutes, return error
      if (+info.videoDetails.lengthSeconds > 600) {
        return NextResponse.json(
          {
            message: "The video is too long. The maximum length is 10 minutes",
          },
          {
            status: 500,
          }
        );
      }

      const title = info.videoDetails.title
        .replace(" (Official Music Video)", "")
        .replace(" [Official Music Video]", "");

      const stream = ytdl.downloadFromInfo(info, {
        filter: "audioonly",
      });

      return new Promise<Buffer>((resolve, reject) => {
        const _buf = Array<any>();
        stream.on("data", (chunk) => _buf.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(_buf)));
        stream.on("error", (err) => reject(`error converting stream - ${err}`));
      })
        .then((buffer) => {
          const headers = {
            "Content-Type": "audio/mpeg",
            "Content-Length": buffer.length.toString(),
            Title: encodeURI(title),
            Author: encodeURI(info.videoDetails.author.name),
            Thumbnail: encodeURI(info.videoDetails.thumbnails[0]?.url) || "",
          };

          return new Response(buffer, { headers });
        })
        .catch((e) => {
          console.error(e);
          return NextResponse.json(
            {
              message: "Error when converting stream",
            },
            { status: 500 }
          );
        });
    })
    .catch((e) => {
      return NextResponse.json(
        {
          message: "Error when fetching video info",
        },
        { status: 500 }
      );
    });
}
