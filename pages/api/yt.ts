import { NextApiRequest, NextApiResponse } from "next";
import ytdl from "ytdl-core";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(400).end();
  const { url } = req.body;
  if (typeof url !== "string") return res.status(400).end();
  try {
    const info = await ytdl.getInfo(url);
    res.setHeader("x-yt-id", info.videoDetails.videoId);
    res.setHeader("x-yt-title", encodeURIComponent(info.videoDetails.title));
    res.setHeader(
      "x-yt-author",
      encodeURIComponent(info.videoDetails.author.name)
    );
    res.setHeader(
      "x-yt-category",
      encodeURIComponent(info.videoDetails.category)
    );
    res.setHeader("x-yt-thumb", info.videoDetails.thumbnails[0]?.url || "");
    res.setHeader("content-type", "audio/mpeg");
    const stream = ytdl.downloadFromInfo(info, {
      filter: "audioonly",
    });
    stream.on("finish", () => {
      res.end();
    });
    stream.on("error", (err) => {
      console.log("err: ", err);
      res.status(500).end();
    });
    stream.pipe(res);
  } catch (err) {
    console.log("err: ", err);
    res.status(500).end();
  }
}
