import type { HistoryItem, Media } from "@/interfaces";
import { toDisplayCoverUrl } from "@/lib/mergePlayerMedia";
import { mergeTrackMetadata, peekSearchMeta } from "@/lib/searchMeta";
import { isMarkedAudioTrackVideo, markAudioTrackVideo } from "@/lib/trackFlags";
import { getYouTubeId } from "@/utils";
import { getCachedMediaUrl, getMedia } from "@/utils/cache";

function buildMetadata(
  sourceUrl: string,
  metadata?: Partial<Media["metadata"]>,
): Media["metadata"] {
  const id = getYouTubeId(sourceUrl) ?? metadata?.id ?? null;
  const sessionMeta = id ? peekSearchMeta(id) : undefined;
  const merged = mergeTrackMetadata(metadata, sessionMeta, { id });
  return {
    ...merged,
    coverUrl: toDisplayCoverUrl(merged.coverUrl, id ? String(id) : null),
  };
}

/** Drop expired proxy video URLs — YouTube video uses embed; local files keep blob URLs. */
function withoutStaleProxyVideo(media: Media): Media {
  const { videoUrl, ...rest } = media;
  if (videoUrl && !videoUrl.startsWith("/api/stream/")) {
    return media;
  }
  return rest;
}

function withAtvFlag(media: Media): Media {
  const id = getYouTubeId(media.sourceUrl) ?? media.metadata.id;
  const atv = Boolean(media.isAudioTrackVideo) || isMarkedAudioTrackVideo(id);
  if (atv && id) markAudioTrackVideo(id, true);
  return atv ? { ...media, isAudioTrackVideo: true } : media;
}

export type ResolvePlayableOptions = {
  sourceUrl: string;
  metadata?: Partial<Media["metadata"]>;
  /** History row — preserves extra fields and strips stale proxy video URLs. */
  fromHistory?: HistoryItem;
};

/**
 * Resolve on-device cache into playable Media.
 * Single entry point for history replay, session restore, and stream cache hits.
 */
export async function resolvePlayableMedia(
  options: ResolvePlayableOptions,
): Promise<Media | null> {
  const { sourceUrl, metadata, fromHistory } = options;

  if (sourceUrl.startsWith("local:")) {
    const blob = await getMedia(sourceUrl);
    if (!blob) return null;
    if (fromHistory) {
      return { ...fromHistory, fileUrl: URL.createObjectURL(blob) };
    }
    return {
      fileUrl: URL.createObjectURL(blob),
      sourceUrl,
      metadata: buildMetadata(sourceUrl, metadata),
    };
  }

  const fileUrl = await getCachedMediaUrl(sourceUrl);
  if (!fileUrl) return null;

  if (fromHistory) {
    return withAtvFlag(
      withoutStaleProxyVideo({
        ...fromHistory,
        fileUrl,
        metadata: buildMetadata(sourceUrl, fromHistory.metadata),
      }),
    );
  }

  return withAtvFlag({
    fileUrl,
    sourceUrl,
    metadata: buildMetadata(sourceUrl, metadata),
  });
}

/** YouTube watch URL for a history item, if one can be derived. */
export function historyItemSourceUrl(item: HistoryItem): string | null {
  if (item.sourceUrl.startsWith("http")) return item.sourceUrl;
  const id = item.metadata.id;
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
