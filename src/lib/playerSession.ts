import type { Media } from "@/interfaces";
import { durableCoverUrl, isWeakYtimgCoverUrl, upgradeCoverUrl } from "@/lib/coverUrl";
import { peekSearchMeta } from "@/lib/searchMeta";
import { getYouTubeId } from "@/utils";
import { isSameMediaSource } from "@/utils/player";

function coverProxyUrl(raw: string | undefined, ytId: string | null): string {
  if (!raw) return "";
  if (raw.startsWith("blob:") || raw.startsWith("data:")) return raw;
  const proxyUrl = raw.startsWith("/api/cover")
    ? raw
    : `/api/cover?url=${encodeURIComponent(upgradeCoverUrl(raw))}`;
  if (!ytId || !/^[\w-]{11}$/.test(ytId) || isWeakYtimgCoverUrl(proxyUrl)) {
    return proxyUrl;
  }
  const parsed = new URL(proxyUrl, "https://moonlit.invalid");
  parsed.searchParams.set("v", ytId);
  return `${parsed.pathname}${parsed.search}`;
}

/** Normalize a cover URL for <Image> display (proxy remote CDN URLs). */
export function toDisplayCoverUrl(raw: string | undefined, ytId: string | null): string {
  return (
    coverProxyUrl(ytId ? durableCoverUrl(raw, ytId) : raw, ytId) ||
    (ytId
      ? `/api/cover?url=${encodeURIComponent(`https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`)}`
      : "")
  );
}

function trustedProvisionalCover(raw: string | undefined, ytId: string | null): string {
  if (!raw || isWeakYtimgCoverUrl(raw)) return "";
  return coverProxyUrl(raw, ytId);
}

/** Shell media while a URL resolves — keeps titles/cover from search stash when present. */
export function buildProvisionalMedia(
  url: string,
  initialMeta?: Partial<Media["metadata"]>,
): Media {
  const ytId = getYouTubeId(url);
  if (initialMeta) {
    return {
      fileUrl: "",
      sourceUrl: url,
      metadata: {
        id: ytId || null,
        title: initialMeta.title || "Unknown",
        author: initialMeta.author || "Unknown",
        artist: initialMeta.artist || undefined,
        album: initialMeta.album || undefined,
        coverUrl: trustedProvisionalCover(initialMeta.coverUrl, ytId),
      },
    };
  }
  return {
    fileUrl: "",
    sourceUrl: url,
    metadata: {
      id: ytId || null,
      title: "",
      author: "",
      coverUrl: "",
    },
  };
}

/** Normalize metadata once when a track enters the shared session. */
export function normalizePlayerMedia(media: Media | null): Media | null {
  if (!media) return null;
  const id = getYouTubeId(media.sourceUrl);
  return {
    ...media,
    metadata: {
      ...media.metadata,
      coverUrl: toDisplayCoverUrl(media.metadata.coverUrl, id),
    },
  };
}

export type PlayerMode = "hidden" | "expanded" | "mini";
export interface OpenPlayerOptions {
  url?: string | null;
  media?: Media | null;
  expand?: boolean;
  syncUrl?: boolean;
  autoPlay?: boolean;
  resumePosition?: number;
  recordHistory?: boolean;
}
export type PlayerSession = {
  media: Media | null;
  mode: PlayerMode;
  url: string | null;
  autoPlay: boolean;
  resumeAt: number;
  revision: number;
};
export const emptyPlayerSession: PlayerSession = {
  media: null,
  mode: "hidden",
  url: null,
  autoPlay: false,
  resumeAt: 0,
  revision: 0,
};
type Action =
  | { type: "open"; options: OpenPlayerOptions }
  | { type: "media"; update: Media | null | ((previous: Media | null) => Media | null) }
  | { type: "collapse" }
  | { type: "expand" }
  | { type: "close" };

/** Track changes are atomic; changing the layout leaves the track revision intact. */
export function playerSessionReducer(
  state: PlayerSession,
  action: Action,
): PlayerSession {
  if (action.type === "media") {
    const media =
      typeof action.update === "function" ? action.update(state.media) : action.update;
    const source = state.url || state.media?.sourceUrl;
    if (media && source && !isSameMediaSource(media.sourceUrl, source)) return state;
    return { ...state, media: normalizePlayerMedia(media) };
  }
  if (action.type === "close")
    return { ...emptyPlayerSession, revision: state.revision + 1 };
  if (action.type === "collapse")
    return { ...state, mode: state.mode === "hidden" ? "hidden" : "mini" };
  if (action.type === "expand")
    return {
      ...state,
      mode: state.mode === "hidden" ? "hidden" : "expanded",
      autoPlay: true,
    };
  const options = action.options;
  const url = options.url !== undefined ? options.url : options.media ? null : state.url;
  const id = url ? getYouTubeId(url) : null;
  const media =
    options.media !== undefined
      ? options.media
      : options.url
        ? buildProvisionalMedia(options.url, id ? peekSearchMeta(id) : undefined)
        : state.media;
  return {
    media: normalizePlayerMedia(media),
    mode: options.expand === false ? "mini" : "expanded",
    url,
    autoPlay: options.autoPlay !== false,
    resumeAt: Number.isFinite(options.resumePosition)
      ? Math.max(0, options.resumePosition)
      : 0,
    revision: state.revision + 1,
  };
}
