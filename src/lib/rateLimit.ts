type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

export function getClientIp(request: Request): string {
  // Prefer CF-Connecting-IP when behind Cloudflare — X-Forwarded-For can be
  // spoofed or collapse many clients onto one hop if misconfigured.
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }
  if (entry.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  entry.count++;
  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests. Please try again later.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}
