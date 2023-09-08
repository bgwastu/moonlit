import { serve } from "@hono/node-server";
import { Hono, HonoRequest } from "hono";
import { validator } from "hono/validator";
import * as ytdl from "ytdl-core";

function isYoutubeURL(url: string) {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return youtubeRegex.test(url);
}

const app = new Hono();
app.post(
  "/yt",
  validator("json", (val, c) => {
    if (!isYoutubeURL(val["url"])) {
      return c.json({ message: "Invalid YouTube URL" }, 400);
    }
    return { url: val["url"] };
  }),
  async (c, next) => {
    const { url } = c.req.valid("json");

    return ytdl
      .getInfo(url)
      .then((info) => {

        // check whether the video is available
        if (info.player_response.playabilityStatus.status !== "OK") {
          return c.json({ message: "Video is not available" }, 422);
        }

        // if the length of the video is more than 10 minutes, return error
        if (+info.videoDetails.lengthSeconds > 600) {
          return c.json({ message: "Video is too long, maximum is 10 minutes" }, 422);
        }

        const title = info.videoDetails.title
          .replace(" (Official Music Video)", "")
          .replace(" [Official Music Video]", "");
      
        const stream = ytdl.downloadFromInfo(info, {
          filter: "audioonly",
        });

        return c.newResponse(stream, {
          headers: {
            "content-type": "audio/mpeg",
            "x-yt-title": encodeURI(title),
            "x-yt-thumb": encodeURI(info.videoDetails.thumbnails[0]?.url) || "",
          }
        });
      })
      .catch((e) => {
        console.error(e);
        return c.json({ message: "Error when fetching video info" }, 500);
      });
  }
);

serve(app);
