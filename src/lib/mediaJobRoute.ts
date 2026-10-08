import { apiError } from "@/lib/apiError";
import { audioJobResponse } from "@/lib/audioJobResponse";
import { createMediaJob } from "@/lib/audioWorker";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { requestYoutubeCredentials } from "@/lib/youtubeCredentials";
import { getYouTubeId } from "@/utils";

/** Audio and optional video share validation, credentials and job handling. */
export async function prepareMediaJob(request: Request, kind: "audio" | "video") {
  const limit = checkRateLimit(
    (kind === "audio" ? "youtube:extract:" : "video:extract:") + getClientIp(request),
    kind === "audio" ? 30 : 15,
    60000,
  );
  if (limit.ok === false) return rateLimitResponse(limit.retryAfterSec);
  try {
    const body = await request.json();
    const videoId = typeof body?.url === "string" ? getYouTubeId(body.url) : null;
    if (!videoId) return apiError("Invalid YouTube URL", 400);
    const credentials = await requestYoutubeCredentials(request, body.cookies);
    return audioJobResponse(
      await createMediaJob(kind, videoId, credentials, request.signal),
    );
  } catch (error) {
    if (request.signal.aborted) return apiError("Request cancelled", 499);
    if (error instanceof SyntaxError) return apiError("Invalid JSON request", 400);
    const failure = error as Error & { status?: number; code?: string };
    return apiError(
      failure.message || "Media is unavailable.",
      failure.status || 502,
      undefined,
      failure.code,
    );
  }
}
