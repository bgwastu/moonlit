import { Media } from "@/interfaces";
import { loadHistoryFromStorage } from "@/lib/historyStorage";
import { type PreparedMedia, StreamError, prepareMedia } from "@/lib/mediaPreparation";
import { resolvePlayableMedia } from "@/lib/playFromCache";
import {
  isKnownMetaValue,
  mergeTrackMetadata,
  peekSearchMeta,
  stashSearchMeta,
} from "@/lib/searchMeta";
import { isMarkedAudioTrackVideo, markAudioTrackVideo } from "@/lib/trackFlags";
import { YOUTUBE_STATUS_CHANGED_EVENT } from "@/lib/youtubeStatus";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";

export { StreamError } from "@/lib/mediaPreparation";

export interface StreamState {
  status: "idle" | "extracting" | "ready" | "error";
  message?: string;
}

function buildMetadata(
  id: string | null,
  fallback: Partial<Media["metadata"]> = {},
): Media["metadata"] {
  return {
    id,
    title: fallback.title || "Unknown",
    author: fallback.author || "Unknown",
    ...(fallback.artist != null && { artist: fallback.artist }),
    ...(fallback.album != null && { album: fallback.album }),
    coverUrl: fallback.coverUrl || "",
  };
}

type ExtractPayload = PreparedMedia;

async function extractYouTube(
  url: string,
  abortSignal?: AbortSignal,
  onState?: (state: StreamState) => void,
): Promise<ExtractPayload> {
  try {
    return await prepareMedia(url, "audio", abortSignal, (message) =>
      onState?.({ status: "extracting", message }),
    );
  } finally {
    window.dispatchEvent(new Event(YOUTUBE_STATUS_CHANGED_EVENT));
  }
}

function mediaFromExtract(
  url: string,
  data: ExtractPayload,
  fileUrlOverride?: string,
  priorMeta?: Media["metadata"],
): Media {
  const id = getYouTubeId(url);
  const resolvedMetadata = mergeTrackMetadata(
    buildMetadata(id || "unknown", {
      title: data.metadata?.title || "",
      author: data.metadata?.author || "",
      artist: data.metadata?.artist,
      album: data.metadata?.album,
      coverUrl: data.metadata?.coverUrl || "",
    }),
    priorMeta,
  );

  markAudioTrackVideo(id, Boolean(data.isAudioTrackVideo));

  return {
    fileUrl: fileUrlOverride || `/api/stream/${data.token}`,
    sourceUrl: url,
    ...(data.isAudioTrackVideo && { isAudioTrackVideo: true }),
    metadata: resolvedMetadata,
  };
}

/**
 * Extract a playable media from a URL. Handles:
 *   - Direct media files (local, same-origin, or remote .mp3/.m4a/etc.)
 *   - YouTube URLs (via the /api/stream/extract endpoint)
 *
 * Video is prepared separately, only when the player requests it.
 */
export async function streamWithProgress(
  url: string,
  onState: (state: StreamState) => void,
  abortSignal?: AbortSignal,
  { localOnly = false }: { localOnly?: boolean } = {},
): Promise<Media> {
  // ---- Direct media files ----
  if (isDirectMediaURL(url)) {
    if (localOnly) {
      const cached = await resolvePlayableMedia({ sourceUrl: url });
      if (cached) return cached;
      throw new StreamError(
        "This song is not saved on this device.",
        "LOCAL_MEDIA_UNAVAILABLE",
      );
    }
    return handleDirectMedia(url, onState, abortSignal);
  }

  // ---- YouTube ----
  const isYouTube = isYoutubeURL(url);
  if (!isYouTube) {
    throw new StreamError("Unsupported URL");
  }

  const id = getYouTubeId(url);
  const priorMeta = id ? peekSearchMeta(id) : undefined;
  const historyMeta = peekHistoryMeta(id, url);
  const cached = await resolvePlayableMedia({
    sourceUrl: url,
    metadata: mergeTrackMetadata(priorMeta, historyMeta, id ? { id } : undefined),
  });

  // Audio cache hit: skip extraction. Optional video has a separate cache.
  // Recover titles from history / oembed when stash was empty (pasted links).
  if (cached) {
    const atv = Boolean(cached.isAudioTrackVideo) || isMarkedAudioTrackVideo(id);
    const coverUrl =
      cached.metadata.coverUrl ||
      priorMeta?.coverUrl ||
      historyMeta?.coverUrl ||
      (id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : "");

    let metadata = mergeTrackMetadata(cached.metadata, priorMeta, historyMeta, {
      coverUrl,
      ...(id ? { id } : {}),
    });

    // A cached track is already playable offline. Never re-extract just to improve
    // metadata, otherwise history replay can unexpectedly call YouTube again.
    if (id && isKnownMetaValue(metadata.title)) stashSearchMeta(id, metadata);
    onState({ status: "ready" });
    return {
      ...cached,
      ...(atv ? { isAudioTrackVideo: true } : {}),
      metadata,
    };
  }

  if (localOnly)
    throw new StreamError(
      "This song is not saved on this device. Open a music file to keep listening.",
      "LOCAL_MEDIA_UNAVAILABLE",
    );

  onState({ status: "extracting", message: "Extracting stream..." });

  const data = await extractYouTube(url, abortSignal, onState);
  onState({ status: "ready" });
  return mediaFromExtract(
    url,
    data,
    undefined,
    mergeTrackMetadata(priorMeta, historyMeta),
  );
}

function peekHistoryMeta(
  id: string | null,
  sourceUrl: string,
): Partial<Media["metadata"]> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const items = loadHistoryFromStorage();
    const hit = items.find((item) => {
      if (item.sourceUrl === sourceUrl) return true;
      if (!id) return false;
      return item.metadata?.id === id || getYouTubeId(item.sourceUrl) === id;
    });
    return hit?.metadata;
  } catch {
    return undefined;
  }
}

// ---- Direct media handler (inlined from previous implementation) ----

async function handleDirectMedia(
  url: string,
  onState: (state: StreamState) => void,
  abortSignal?: AbortSignal,
): Promise<Media> {
  onState({ status: "ready" });

  const fallbackTitle = (() => {
    try {
      const pathname = url.startsWith("/") ? url : new URL(url, "https://a").pathname;
      const name = pathname.split("/").pop() || "";
      return (
        decodeURIComponent(name).replace(/\.(mp3|m4a|mp4|webm|ogg|wav)$/i, "") ||
        "Unknown"
      );
    } catch {
      return "Unknown";
    }
  })();

  let fileUrl: string;
  if (url.startsWith("/")) {
    fileUrl = url;
  } else if (typeof window !== "undefined") {
    try {
      const u = new URL(url);
      fileUrl = u.origin === window.location.origin ? url : url;
    } catch {
      fileUrl = url;
    }
  } else {
    fileUrl = url;
  }

  const baseMeta = buildMetadata(null, { title: fallbackTitle });

  // Try to read ID3 tags from local .mp3 files
  if (
    typeof window !== "undefined" &&
    /\.mp3(\?|$)/i.test(url.startsWith("/") ? url : new URL(url).pathname)
  ) {
    try {
      const resolvedUrl = fileUrl.startsWith("/")
        ? `${window.location.origin}${fileUrl}`
        : fileUrl;
      const res = await fetch(resolvedUrl, {
        headers: { Range: "bytes=0-131071" },
        signal: abortSignal,
      });
      if (res.ok && res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const parse = (await import("id3-parser")).default;
        const tags = parse(buf);
        if (tags && typeof tags === "object") {
          let coverUrl = baseMeta.coverUrl;
          if (tags.image?.data) {
            const blob = new Blob([new Uint8Array(tags.image.data)], {
              type: tags.image.mime || "image/jpeg",
            });
            coverUrl = URL.createObjectURL(blob);
          }
          return {
            fileUrl,
            sourceUrl: url,
            metadata: {
              ...baseMeta,
              title: (tags.title as string)?.trim() || baseMeta.title,
              author: (tags.artist as string)?.trim() || baseMeta.author,
              ...((tags.artist as string)?.trim() && {
                artist: (tags.artist as string).trim(),
              }),
              ...((tags.album as string)?.trim() && {
                album: (tags.album as string).trim(),
              }),
              coverUrl,
            },
          };
        }
      }
    } catch {}
  }

  const isVideoFile = /\.(mp4|webm)(\?|$)/i.test(
    url.startsWith("/")
      ? url
      : (() => {
          try {
            return new URL(url).pathname;
          } catch {
            return url;
          }
        })(),
  );

  return {
    fileUrl,
    sourceUrl: url,
    ...(isVideoFile && { videoUrl: fileUrl }),
    metadata: baseMeta,
  };
}
