import { workerJson } from "@/lib/audioWorker";
import { enforceYouTubeStatusLimit } from "@/lib/rateLimitYouTube";
import { requestYoutubeCredentials } from "@/lib/youtubeCredentials";
import type { YouTubeStatus } from "@/lib/youtubeStatus";

export async function GET(request: Request) {
  const limited = enforceYouTubeStatusLimit(request);
  if (limited) return limited;
  try {
    const credentials = await requestYoutubeCredentials(request);
    const status = await workerJson<YouTubeStatus>("/v1/status", {
      method: "POST",
      body: JSON.stringify(credentials),
      signal: request.signal,
    });
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = error as Error & { code?: string };
    return Response.json(
      {
        state: "degraded",
        online: false,
        searchOk: false,
        extractOk: false,
        code: failure.code || "YOUTUBE_UNAVAILABLE",
        error: failure.message,
        expiresAt: Date.now() + 15000,
        retryAfterMs: 10000,
        ...(failure.code === "INVALID_COOKIES" ? { cookieSource: "user" } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
