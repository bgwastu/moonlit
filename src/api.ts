import localforage from "localforage";
import { getYouTubeId, isYoutubeURL } from "./utils";
import { Song } from "./interfaces";

export async function getSongFromYouTube(url: string): Promise<Song> {
  if (!isYoutubeURL(url) && !getYouTubeId(url)) {
    throw new Error("Invalid YouTube URL");
  }

  // check cached music
  const id = getYouTubeId(url);
  const cachedMusic = (await localforage.getItem(id)) as any;

  if (cachedMusic) {
    return {
      fileUrl: URL.createObjectURL(cachedMusic.blob),
      metadata: cachedMusic.metadata,
    };
  }

  return fetch("/api/yt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
    }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json();
      if (body.message) {
        throw new Error(body.message);
      }
      throw new Error(`Error downloading YouTube music (${res.statusText})`);
    }

    const blob = await res.blob();
    const metadata = {
      id,
      title: decodeURI(res.headers.get("Title")),
      author: decodeURI(res.headers.get("Author")),
      coverUrl: decodeURI(res.headers.get("Thumbnail")),
    };

    // save the music & metadata to the cache localForage
    localforage.setItem(id, { blob, metadata });

    const fileUrl = URL.createObjectURL(blob);
    return { fileUrl, metadata };
  });
}
