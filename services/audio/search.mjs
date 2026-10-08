import { YTNodes } from "youtubei.js";

function thumbnail(thumbnails, id) {
  return (
    [...(thumbnails || [])].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url ||
    "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg"
  );
}

/** Search uses the same credential-isolated worker as audio and video. */
export async function searchYouTube(
  yt,
  { query, includeVideos = false, limit = Infinity },
  signal,
) {
  signal.throwIfAborted();
  const music = await yt.music.search(query, { type: "song" });
  signal.throwIfAborted();
  const results = [];
  for (const song of music.songs?.contents || []) {
    if (results.length >= limit) break;
    if (!/^[\w-]{11}$/.test(song.id || "") || !(song.duration?.seconds > 0)) continue;
    const artists = (song.artists || []).map((artist) => ({
      name: artist.name || "Unknown",
      ...(artist.channel_id ? { channelId: artist.channel_id } : {}),
    }));
    results.push({
      id: song.id,
      url: "https://www.youtube.com/watch?v=" + song.id,
      title: song.title || "Untitled",
      author: artists[0]?.name || "Unknown",
      artists,
      ...(song.album?.name
        ? { album: { name: song.album.name, id: song.album.id } }
        : {}),
      thumbnail: thumbnail(song.thumbnails, song.id),
      lengthSeconds: song.duration.seconds,
    });
  }
  if (results.length || !includeVideos) return results;
  const videos = await yt.search(query, { type: "video" });
  signal.throwIfAborted();
  for (const video of videos.results.filterType(YTNodes.Video)) {
    if (results.length >= limit) break;
    const id = video.video_id;
    if (!/^[\w-]{11}$/.test(id || "") || !(video.duration?.seconds > 0)) continue;
    results.push({
      id,
      url: "https://www.youtube.com/watch?v=" + id,
      title: video.title?.toString() || "Untitled",
      author: video.author?.name || "YouTube",
      thumbnail: video.best_thumbnail?.url || thumbnail(video.thumbnails, id),
      lengthSeconds: video.duration.seconds,
      ...(video.view_count
        ? { viewCount: Number(video.view_count.toString().replace(/\D/g, "")) || 0 }
        : {}),
      ...(video.is_live ? { isLive: true } : {}),
    });
  }
  return results;
}
