import type { Media } from "@/interfaces";
import { getYouTubeId, isYoutubeURL } from "@/utils";

/** Soft-replace the browser URL without triggering a Next.js navigation/remount. */
export function softReplaceUrl(path: string) {
  if (typeof window === "undefined") return;
  const next = path.startsWith("/") ? path : `/${path}`;
  if (window.location.pathname + window.location.search === next) return;
  window.history.replaceState(window.history.state, "", next);
}

export function playerPathForMedia(url: string | null | undefined, media: Media | null) {
  if (url) {
    if (isYoutubeURL(url)) {
      const id = getYouTubeId(url);
      if (id) return `/watch?v=${id}`;
    }
    return `/player?url=${encodeURIComponent(url)}`;
  }
  if (media?.sourceUrl) {
    if (isYoutubeURL(media.sourceUrl)) {
      const id = getYouTubeId(media.sourceUrl) ?? media.metadata.id;
      if (id) return `/watch?v=${id}`;
    }
    if (media.sourceUrl.startsWith("local:")) return "/player";
    return `/player?url=${encodeURIComponent(media.sourceUrl)}`;
  }
  if (media?.metadata.id) return `/watch?v=${media.metadata.id}`;
  return "/player";
}
