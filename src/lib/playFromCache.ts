import type { HistoryItem, Media } from "@/interfaces";
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
  return mergeTrackMetadata(metadata, sessionMeta, { id });
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

/** Build playable media from a locally cached audio blob, if available. */
export async function mediaFromLocalCache(
  sourceUrl: string,
  metadata?: Partial<Media["metadata"]>,
): Promise<Media | null> {
  const fileUrl = await getCachedMediaUrl(sourceUrl);
  if (!fileUrl) return null;

  // Audio only — YouTube visuals use a client embed, not IndexedDB.
  return withAtvFlag({
    fileUrl,
    sourceUrl,
    metadata: buildMetadata(sourceUrl, metadata),
  });
}

/** Resolve a history/local item to playable media using on-device cache. */
export async function resolveCachedMedia(item: HistoryItem): Promise<Media | null> {
  if (item.sourceUrl.startsWith("local:")) {
    const blob = await getMedia(item.sourceUrl);
    if (!blob) return null;
    return { ...item, fileUrl: URL.createObjectURL(blob) };
  }

  const fileUrl = await getCachedMediaUrl(item.sourceUrl);
  if (!fileUrl) return null;

  return withAtvFlag(
    withoutStaleProxyVideo({
      ...item,
      fileUrl,
      metadata: buildMetadata(item.sourceUrl, item.metadata),
    }),
  );
}

/** YouTube watch URL for a history item, if one can be derived. */
export function historyItemSourceUrl(item: HistoryItem): string | null {
  if (item.sourceUrl.startsWith("http")) return item.sourceUrl;
  const id = item.metadata.id;
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
