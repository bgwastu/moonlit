/** Hostnames allowed for image proxy (CORS-free cover images) */
export const IMAGE_PROXY_ALLOWED_HOSTS = new Set([
  "i.ytimg.com",
  "img.youtube.com",
  "p16-sign.tiktokcdn-us.com",
  "p16-sign.tiktokcdn.com",
  "p77-sign.tiktokcdn-us.com",
  "p77-sign.tiktokcdn.com",
  "v16-webapp.tiktok.com",
  "v19-webapp.tiktok.com",
]);

export function isAllowedImageUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return IMAGE_PROXY_ALLOWED_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/** When API/yt-dlp omits art, i.ytimg still serves per-video thumbs. */
export function defaultYouTubeThumbnailById(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Upgrade YouTube thumbnail to maxres without doubling (avoid maxresmaxresdefault) */
export function toMaxResCoverUrl(url: string): string {
  if (!url) return url;
  return url.replace(/(?<!maxres)(hq|mq|sd)?default/, "maxresdefault");
}

/**
 * Return a URL suitable for loading in canvas (same-origin proxy for CORS-blocked hosts).
 * Use for dominant color extraction etc.
 */
export function getImageUrlForCanvas(coverUrl: string): string {
  if (!coverUrl) return coverUrl;
  const upgraded = toMaxResCoverUrl(coverUrl);
  if (isAllowedImageUrl(upgraded)) {
    return `/api/image-proxy?url=${encodeURIComponent(upgraded)}`;
  }
  return upgraded;
}

/**
 * Search listing thumbs: avoid maxres (smaller, consistent). Strip maxres URLs to hqdefault.
 */
export function normalizeSearchThumbnailQuality(url: string): string {
  if (!url) return url;
  return url
    .replace(/maxresdefault\.jpg/gi, "hqdefault.jpg")
    .replace(/\/vi\/([^/]+)\/maxres\.jpg/gi, "/vi/$1/hqdefault.jpg");
}

/**
 * Thumbnail URL for search/API responses: same-origin proxy when allowed; no maxres upgrade.
 */
export function searchResultThumbnailUrl(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith("/api/image-proxy")) return raw;
  const normalized = normalizeSearchThumbnailQuality(raw);
  if (isAllowedImageUrl(normalized)) {
    return `/api/image-proxy?url=${encodeURIComponent(normalized)}`;
  }
  return normalized;
}
