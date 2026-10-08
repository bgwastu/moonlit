import { youtubeErrorCode } from "@/lib/apiError";
import { readRequestCookiesResult } from "@/lib/cookies";
import {
  enforceYouTubeSearchLimit,
  handleYoutubeGuardError,
} from "@/lib/rateLimitYouTube";
import { withYoutubeCircuit } from "@/lib/youtubeCircuit";
import { resolveYoutubeCredentials } from "@/lib/youtubeCredentials";
import { recordCapability } from "@/lib/youtubeHealth";
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
  const limited = enforceYouTubeSearchLimit(request);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const includeVideos = searchParams.get("videos") === "1";

  if (!query) {
    return Response.json({ results: [] });
  }

  let scope = "anonymous";
  try {
    const supplied = readRequestCookiesResult(request);
    if (supplied.status === "invalid")
      return Response.json(
        { error: supplied.error, code: "INVALID_COOKIES" },
        { status: 400 },
      );
    const cookies = supplied.status === "ok" ? supplied.cookies : undefined;
    scope = (await resolveYoutubeCredentials(cookies)).scope;
    const searchOptions = { cookies };

    const musicResults = await withYoutubeCircuit(
      () => searchMusic(query, searchOptions),
      `search:${scope}`,
    );
    await recordCapability(scope, "search").catch(() => {});

    if (musicResults.length > 0) {
      return Response.json({ results: flattenToSearchResults(musicResults) });
    }

    if (!includeVideos) {
      return Response.json({ results: [] });
    }

    const videoResults = await withYoutubeCircuit(
      () => searchYouTubeVideos(query, searchOptions),
      `search:${scope}`,
    );
    return Response.json({ results: videoResults });
  } catch (error) {
    await recordCapability(scope, "search", error).catch(() => {});
    const circuit = handleYoutubeGuardError(error);
    if (circuit) return circuit;

    const message = error instanceof Error ? error.message : "Failed to search YouTube.";
    console.error("[Moonlit] YouTube search error:", message);
    const code = youtubeErrorCode(message);
    return Response.json(
      { error: message, results: [], ...(code ? { code } : {}) },
      { status: 500 },
    );
  }
}
