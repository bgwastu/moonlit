import { videoInfo, getFormats, getReadableStream } from "youtube-ext";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const { url } = req.body;

  if (!url) {
    res.status(400).json({ message: "Invalid YouTube URL" });
    return;
  }

  try {
    const info = await videoInfo(url);
    const formats = await getFormats(info.stream);
    const format = formats.find((x) => x.mimeType?.includes("audio/mp4"));

    if (!format) {
      res.status(500).json({ message: "No audio format found" });
      return;
    }

    const stream = await getReadableStream(format);

    const title = info.title
      .replace(" (Official Music Video)", "")
      .replace(" [Official Music Video]", "")
      .replace("", "");

    const author = info.channel.name
      .replace(" - Topic", "")
      .replace("VEVO", "");

    const headers = {
      "Content-Type": "audio/mpeg",
      "Content-Length": format!.contentLength?.toString(),
      Title: encodeURI(title),
      Author: encodeURI(author),
      Thumbnail: encodeURI(info.thumbnails[0]?.url) || "",
    };

    stream.pipe(res);
    res.writeHead(200, headers);
    stream.on("error", (err) => res.status(500).json({ message: err }));
    stream.on("end", () => res.end());
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}
