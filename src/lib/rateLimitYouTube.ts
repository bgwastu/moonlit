import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import { YoutubeCircuitOpenError } from "@/lib/youtubeCircuit";

const MINUTE_MS = 60_000;

export function enforceYouTubeSearchLimit(request: Request): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(`youtube:search:${ip}`, 40, MINUTE_MS);
  if (result.ok === false) return rateLimitResponse(result.retryAfterSec);
  return null;
}

export function enforceYouTubeExtractLimit(request: Request): Response | null {
  const ip = getClientIp(request);
  // Generous enough for a retry + a few track switches; still blocks extract storms.
  const result = checkRateLimit(`youtube:extract:${ip}`, 30, MINUTE_MS);
  if (result.ok === false) return rateLimitResponse(result.retryAfterSec);
  return null;
}

const STATUS_WINDOW_MS = 5 * MINUTE_MS;

/** Lenient limits — status is polled by the homepage chip and must not feel blocked. */
export function enforceYouTubeStatusLimit(
  request: Request,
  kind: "system" | "user" = "system",
): Response | null {
  const ip = getClientIp(request);
  // system: cold-start probes only (cache hits skip this). user: ephemeral privacy probes.
  const limit = kind === "system" ? 30 : 20;
  const result = checkRateLimit(`youtube:status:${kind}:${ip}`, limit, STATUS_WINDOW_MS);
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
