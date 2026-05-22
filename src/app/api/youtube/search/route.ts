import { defaultYouTubeThumbnailById, searchResultThumbnailUrl } from "@/lib/imageProxy";
import {
  type YouTubeSearchResult,
  searchYouTube as searchYouTubeYtDlp,
} from "@/lib/yt-dlp";
import { isTikTokURL } from "@/utils";

class YouTubeSearchUnavailableError extends Error {
  readonly code = "SEARCH_UNAVAILABLE" as const;

  constructor(
    message: string = "Search is currently unavailable. Make sure yt-dlp is installed and add YouTube cookies in Settings (or data/cookies.txt) for restricted content.",
  ) {
    super(message);
    this.name = "YouTubeSearchUnavailableError";
  }
}

function withSearchThumbnails(rows: YouTubeSearchResult[]): YouTubeSearchResult[] {
  return rows.map((r) => ({
    ...r,
    thumbnail: searchResultThumbnailUrl(
      r.thumbnail.trim() || defaultYouTubeThumbnailById(r.id),
    ),
  }));
}

async function searchYouTubeVideos(
  query: string,
  options: { limit?: number } = {},
): Promise<YouTubeSearchResult[]> {
  const limit = Math.min(Math.max(Number(options.limit) || 3, 1), 50);
  const q = query.trim();
  if (!q) return [];

  try {
    const rows = await searchYouTubeYtDlp(q, { limit: Math.min(limit, 10) });
    return withSearchThumbnails(rows);
  } catch (cause) {
    console.error("[Moonlit] yt-dlp search failed.", cause);
    throw new YouTubeSearchUnavailableError();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 3);

  if (!query) {
    return Response.json({ results: [] });
  }

  if (isTikTokURL(query)) {
    return Response.json({ results: [] });
  }

  try {
    const results = await searchYouTubeVideos(query, { limit });
    return Response.json({ results });
  } catch (error) {
    if (error instanceof YouTubeSearchUnavailableError) {
      return Response.json(
        { error: error.message, code: error.code, results: [] },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to search YouTube.";
    return Response.json({ error: message, results: [] }, { status: 500 });
  }
}
