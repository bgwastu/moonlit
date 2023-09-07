import { NextApiRequest, NextApiResponse } from "next";
import ytdl from "ytdl-core";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();
  const { url } = req.body;
  if (typeof url !== "string") return res.status(400).json({
    message: "The url must be a string.",
  });

  try {
    const info = await ytdl.getInfo(url);
    res.setHeader("x-yt-id", info.videoDetails.videoId);
    res.setHeader(
      "x-yt-title",
      encodeURI(
        info.videoDetails.title
          .replace(" (Official Music Video)", "")
          .replace(" [Official Music Video]", "")
      )
    );
    res.setHeader(
      "x-yt-author",
      info.videoDetails.author.name.replace(" - Topic", "")
    );
    res.setHeader("x-yt-category", info.videoDetails.category);
    res.setHeader("x-yt-thumb", info.videoDetails.thumbnails[0]?.url || "");
    res.setHeader("content-type", "audio/mpeg");
    const stream = ytdl.downloadFromInfo(info, {
      filter: "audioonly",
    });
    stream.on("finish", () => {
      res.end();
    });
    stream.on("error", (err) => {
      console.error(err);
      res.status(500).json({
        message: "There was an error when trying to stream the music.",
      });
    });

    stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "There was an error when trying to get the music.",
    });
  }
}

export const config = {
  api: {
    responseLimit: false,
  },
};
