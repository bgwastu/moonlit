import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import ytdl = require("ytdl-core");

function isYoutubeURL(url: string) {
  const youtubeRegex =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return youtubeRegex.test(url);
}

export const getYtMusic = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const url = req.body.url;
  if (!isYoutubeURL(url)) {
    res.status(400).json({ message: "Invalid YouTube URL" });
    return;
  }

  ytdl
    .getInfo(url)
    .then((info) => {
      // check whether the video is available
      if (info.player_response.playabilityStatus.status !== "OK") {
        res.status(422).json({ message: "Video is not available" });
        return;
      }

      // if the length of the video is more than 10 minutes, return error
      if (+info.videoDetails.lengthSeconds > 600) {
        res.status(422).json({
          message: "The video is too long. The maximum length is 10 minutes",
        });
        return;
      }

      const title = info.videoDetails.title
        .replace(" (Official Music Video)", "")
        .replace(" [Official Music Video]", "");

      const headers = {
        "Content-Type": "audio/mpeg",
        Title: encodeURI(title),
        Author: encodeURI(info.videoDetails.author.name),
        Thumbnail: encodeURI(info.videoDetails.thumbnails[0]?.url) || "",
      };

      const stream = ytdl.downloadFromInfo(info, {
        filter: "audioonly",
      });

      res.writeHead(200, headers);
      stream.pipe(res, { end: true });

      stream.on("end", () => {
        res.end();
      });

      stream.on("error", (e) => {
        logger.error(e);
        res.status(500).json({ message: "Error when streaming audio" });
      });
    })
    .catch((e) => {
      console.error(e);
      logger.error(e);
      res.status(500).json({ message: "Error when fetching video info" });
    });
});
