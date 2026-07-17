import type { Media } from "@/interfaces";
import { mergeTrackMetadata, peekSearchMeta } from "@/lib/searchMeta";
import { getYouTubeId } from "@/utils";
import { isSameMediaSource } from "@/utils/player";

function coverProxyUrl(raw: string | undefined, ytId: string | null): string {
  if (!raw) {
    return ytId
      ? `/api/cover?url=${encodeURIComponent(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`)}`
      : "";
  }
  if (
    raw.startsWith("/api/cover") ||
    raw.startsWith("blob:") ||
    raw.startsWith("data:")
  ) {
    return raw;
  }
  return `/api/cover?url=${encodeURIComponent(raw)}`;
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
        coverUrl: coverProxyUrl(initialMeta.coverUrl, ytId),
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
      coverUrl: coverProxyUrl(undefined, ytId),
    },
  };
}

/** Merge extracted / context / provisional media for the active player URL. */
export function mergePlayerMedia({
  url,
  extractedMedia,
  contextMedia,
  provisionalMedia,
}: {
  url?: string;
  extractedMedia: Media | null;
  contextMedia: Media | null;
  provisionalMedia: Media | null;
}): Media | null {
  const sameSource = (m: Media | null | undefined) =>
    m && (!url || isSameMediaSource(m.sourceUrl, url)) ? m : null;
  const extracted = sameSource(extractedMedia);
  const context = sameSource(contextMedia);

  // When history reseeds the same source with a new blob, prefer context over
  // stale extractedMedia (URL-reset never cleared it because the URL matched).
  const fresherContext =
    context?.fileUrl && extracted?.fileUrl && context.fileUrl !== extracted.fileUrl
      ? context
      : null;
  const playable =
    fresherContext ||
    (extracted?.fileUrl ? extracted : null) ||
    (context?.fileUrl ? context : null);
  const shell = playable || extracted || context || provisionalMedia;
  if (!shell) return null;

  const ytId = getYouTubeId(shell.sourceUrl || url || "");
  return {
    ...shell,
    metadata: mergeTrackMetadata(
      shell.metadata,
      playable?.metadata,
      extracted?.metadata,
      context?.metadata,
      provisionalMedia?.metadata,
      ytId ? peekSearchMeta(ytId) : undefined,
    ),
  };
}
