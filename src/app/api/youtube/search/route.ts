import { YouTubeSearchUnavailableError, searchYouTubeVideos } from "@/lib/youtube-api";
import { isTikTokURL } from "@/utils";

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
