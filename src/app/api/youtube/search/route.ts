import { apiError } from "@/lib/apiError";
import { workerJson } from "@/lib/audioWorker";
import { upgradeCoverUrl } from "@/lib/coverUrl";
import { enforceYouTubeSearchLimit } from "@/lib/rateLimitYouTube";
import { requestYoutubeCredentials } from "@/lib/youtubeCredentials";

export async function GET(request: Request) {
  const limited = enforceYouTubeSearchLimit(request);
  if (limited) return limited;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() || "";
  if (!query) return Response.json({ results: [] });
  try {
    const credentials = await requestYoutubeCredentials(request);
    const { results } = await workerJson<{ results: { thumbnail: string }[] }>(
      "/v1/search",
      {
        method: "POST",
        body: JSON.stringify({
          ...credentials,
          query,
          includeVideos: searchParams.get("videos") === "1",
        }),
        signal: request.signal,
        timeoutMs: 45000,
      },
    );
    return Response.json({
      results: results.map((result) => ({
        ...result,
        thumbnail: upgradeCoverUrl(result.thumbnail),
      })),
    });
  } catch (error) {
    const failure = error as Error & { status?: number; code?: string };
    return apiError(
      failure.message || "Failed to search YouTube.",
      failure.status || 502,
      undefined,
      failure.code,
    );
  }
}
