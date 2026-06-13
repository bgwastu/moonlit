export function isYoutubeURL(url: string) {
  const youtubeRegex =
    /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
  return youtubeRegex.test(url);
}

/** True for direct .mp3 / .m4a / .mp4 URLs (https or same-origin path) */
export function isDirectMediaURL(url: string) {
  if (!url || typeof url !== "string") return false;
  // Same-origin media path.
  if (url.startsWith("/") && /\.(mp3|m4a|mp4|webm|ogg|wav)(\?|$)/i.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const pathname = new URL(url).pathname;
    return /\.(mp3|m4a|mp4|webm|ogg|wav)(\?|$)/i.test(pathname);
  } catch {
    return false;
  }
}

export function getPlatform(
  url: string | undefined,
): "youtube" | "local" | "direct" | "unknown" {
  if (!url) return "unknown";
  if (url.startsWith("local:")) return "local";
  if (isYoutubeURL(url)) return "youtube";
  if (isDirectMediaURL(url)) return "direct";
  return "unknown";
}

export function isSupportedURL(url: string) {
  return isYoutubeURL(url) || isDirectMediaURL(url);
}

export function getYouTubeId(url: string) {
  const youtubeRegex =
    /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
  const match = url.match(youtubeRegex);
  return match ? match[1] : null;
}

export function getFormattedTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  const formattedMinutes = String(minutes);
  const formattedSeconds = String(remainingSeconds).padStart(2, "0");

  return `${formattedMinutes}:${formattedSeconds}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  let interval = seconds / 31536000;

  if (interval > 1) {
    return Math.floor(interval) + "y ago";
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return Math.floor(interval) + "mo ago";
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return Math.floor(interval) + "d ago";
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return Math.floor(interval) + "h ago";
  }
  interval = seconds / 60;
  if (interval > 1) {
    return Math.floor(interval) + "m ago";
  }
  return Math.floor(seconds) + "s ago";
}
