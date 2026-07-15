import { apiError, searchErrorCode } from "@/lib/apiError";
import {
  type MusicSearchResult,
  type YouTubeSearchResult,
  searchMusic,
  searchYouTube as searchYouTubeVideos,
} from "@/lib/youtubei";

function flattenToSearchResults(
  musicResults: MusicSearchResult[],
): YouTubeSearchResult[] {
  return musicResults.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    author: r.artists[0]?.name || "Unknown",
    artists: r.artists,
    ...(r.album ? { album: r.album } : {}),
    thumbnail: r.thumbnail,
    lengthSeconds: r.lengthSeconds,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 3);

  if (!query) {
    return Response.json({ results: [] });
  }

  try {
    const musicResults = await searchMusic(query, { limit: Math.min(limit, 50) });

    if (musicResults.length > 0) {
      return Response.json({ results: flattenToSearchResults(musicResults) });
    }

    const videoResults = await searchYouTubeVideos(query, { limit: Math.min(limit, 50) });
    return Response.json({ results: videoResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search YouTube.";
    console.error("[Moonlit] YouTube search error:", message);
    const code = searchErrorCode(message);
    return Response.json(
      { error: message, results: [], ...(code ? { code } : {}) },
      { status: 500 },
    );
  }
}
