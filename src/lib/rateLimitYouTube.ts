import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";

const MINUTE_MS = 60_000;

export function enforceYouTubeSearchLimit(request: Request): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(`youtube:search:${ip}`, 40, MINUTE_MS);
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
  const limit = kind === "system" ? 120 : 100;
  const result = checkRateLimit(`youtube:status:${kind}:${ip}`, limit, STATUS_WINDOW_MS);
  if (result.ok === false) return rateLimitResponse(result.retryAfterSec);
  return null;
}
