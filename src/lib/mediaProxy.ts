/**
 * SSRF-safe validation for media proxy. Only allow public http(s) URLs.
 * Blocks localhost, private IPs, and non-http(s) protocols.
 */
export function isAllowedMediaProxyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    // Localhost
    if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0") {
      return false;
    }
    // IPv4 private / loopback
    if (/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
      return false;
    }
    // IPv6 loopback / link-local
    if (hostname.startsWith("[::1]") || hostname.startsWith("[fe80:")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export const MEDIA_PROXY_PATH = "/api/media/proxy";

/** Build same-origin proxy URL for a direct media URL (avoids CORS). */
export function getMediaProxyUrl(targetUrl: string): string {
  return `${MEDIA_PROXY_PATH}?url=${encodeURIComponent(targetUrl)}`;
}
