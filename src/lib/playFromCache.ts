import type { HistoryItem, Media } from "@/interfaces";
import { getYouTubeId } from "@/utils";
import { getCachedMediaUrl, getMedia } from "@/utils/cache";

function loadSearchMeta(id: string): Partial<Media["metadata"]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(`moonlit-search-meta:${id}`);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Media["metadata"]>;
  } catch {
    return {};
  }
}

function buildMetadata(
  sourceUrl: string,
  metadata?: Partial<Media["metadata"]>,
): Media["metadata"] {
  const id = getYouTubeId(sourceUrl) ?? metadata?.id ?? null;
  const sessionMeta = id ? loadSearchMeta(id) : {};
  const merged = { ...sessionMeta, ...metadata };

  return {
    id,
    title: merged.title || "Unknown",
    author: merged.author || "Unknown",
    ...(merged.artist != null && { artist: merged.artist }),
    ...(merged.album != null && { album: merged.album }),
    coverUrl: merged.coverUrl || "",
  };
}

/** Build playable media from a locally cached audio blob, if available. */
export async function mediaFromLocalCache(
  sourceUrl: string,
  metadata?: Partial<Media["metadata"]>,
): Promise<Media | null> {
  const fileUrl = await getCachedMediaUrl(sourceUrl);
  if (!fileUrl) return null;

  return {
    fileUrl,
    sourceUrl,
    metadata: buildMetadata(sourceUrl, metadata),
  };
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

  return {
    ...item,
    fileUrl,
    metadata: buildMetadata(item.sourceUrl, item.metadata),
  };
}

/** YouTube watch URL for a history item, if one can be derived. */
export function historyItemSourceUrl(item: HistoryItem): string | null {
  if (item.sourceUrl.startsWith("http")) return item.sourceUrl;
  const id = item.metadata.id;
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
