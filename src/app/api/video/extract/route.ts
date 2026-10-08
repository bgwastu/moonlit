import { apiError } from "@/lib/apiError";
import { audioJobResponse } from "@/lib/audioJobResponse";
import { audioProvider, createVideoJob } from "@/lib/audioWorker";
import { readRequestCookiesResult, sanitizeUserCookies } from "@/lib/cookies";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { resolveYoutubeCredentials } from "@/lib/youtubeCredentials";
import { getYouTubeId } from "@/utils";

export async function POST(request: Request) {
  const limit = checkRateLimit(`video:extract:${getClientIp(request)}`, 15, 60000);
  if (limit.ok === false) return rateLimitResponse(limit.retryAfterSec);
  if (audioProvider() !== "sabr")
    return apiError(
      "Native video requires the SABR playback service.",
      503,
      undefined,
      "VIDEO_UNAVAILABLE",
    );
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return apiError("Invalid request", 400);
    const supplied = readRequestCookiesResult(request);
    if (supplied.status === "invalid")
      return apiError(supplied.error, 400, undefined, "INVALID_COOKIES");
    const cookies =
      supplied.status === "ok" ? supplied.cookies : sanitizeUserCookies(body.cookies);
    if (body.cookies && !cookies)
      return apiError("Invalid YouTube cookies.", 400, undefined, "INVALID_COOKIES");
    const videoId = typeof body.url === "string" ? getYouTubeId(body.url) : null;
    if (!videoId) return apiError("Invalid YouTube URL", 400);
    const credentials = await resolveYoutubeCredentials(cookies);
    return audioJobResponse(await createVideoJob(videoId, credentials, request.signal));
  } catch (error) {
    if (request.signal.aborted) return apiError("Request cancelled", 499);
    if (error instanceof SyntaxError) return apiError("Invalid JSON request", 400);
    return apiError(
      (error as Error).message || "Video is unavailable.",
      (error as any).status || 502,
      undefined,
      (error as any).code,
    );
  }
}
