import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { YoutubeCircuitOpenError } from "@/lib/youtubeCircuit";

const MINUTE_MS = 60_000;

export function enforceYouTubeSearchLimit(request: Request): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(`youtube:search:${ip}`, 10, MINUTE_MS);
  if (result.ok === false) return rateLimitResponse(result.retryAfterSec);
  return null;
}

export function enforceYouTubeExtractLimit(request: Request): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(`youtube:extract:${ip}`, 5, MINUTE_MS);
  if (result.ok === false) return rateLimitResponse(result.retryAfterSec);
  return null;
}

export function youtubeCircuitResponse(retryAfterSec: number): Response {
  return Response.json(
    {
      error: "YouTube is temporarily unavailable. Please try again shortly.",
      code: "YOUTUBE_UNAVAILABLE",
    },
    {
      status: 503,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

export function handleYoutubeGuardError(error: unknown): Response | null {
  if (error instanceof YoutubeCircuitOpenError) {
    return youtubeCircuitResponse(error.retryAfterSec);
  }
  return null;
}
