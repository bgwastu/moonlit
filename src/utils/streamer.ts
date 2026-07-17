import { Media } from "@/interfaces";
import { parseApiErrorBody } from "@/lib/apiError";
import { cookieRequestHeaders, getCookiesToUse } from "@/lib/cookies";
import { mediaFromLocalCache } from "@/lib/playFromCache";
import { mergeTrackMetadata, peekSearchMeta } from "@/lib/searchMeta";
import { isMarkedAudioTrackVideo, markAudioTrackVideo } from "@/lib/trackFlags";
import { getYouTubeId, isDirectMediaURL, isYoutubeURL } from "@/utils";

export interface StreamState {
  status: "idle" | "extracting" | "ready" | "error";
  message?: string;
}

export class StreamError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "StreamError";
    this.code = code;
  }
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

type ExtractPayload = {
  token: string;
  isAudioTrackVideo?: boolean;
  metadata?: {
    title?: string;
    author?: string;
    artist?: string;
    album?: string;
    coverUrl?: string;
  };
};

async function extractYouTube(
  url: string,
  abortSignal?: AbortSignal,
): Promise<ExtractPayload> {
  const { cookies } = getCookiesToUse();
  const res = await fetch("/api/stream/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...cookieRequestHeaders(),
    },
    body: JSON.stringify({ url, cookies }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const body = await parseApiErrorBody(res);
    throw new StreamError(body.error || `Extract failed (${res.status})`, body.code);
  }

  return (await res.json()) as ExtractPayload;
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
 * YouTube video visuals use a client-side embed — we only extract audio.
 */
export async function streamWithProgress(
  url: string,
  onState: (state: StreamState) => void,
  abortSignal?: AbortSignal,
): Promise<Media> {
  // ---- Direct media files ----
  if (isDirectMediaURL(url)) {
    return handleDirectMedia(url, onState, abortSignal);
  }

  // ---- YouTube ----
  const isYouTube = isYoutubeURL(url);
  if (!isYouTube) {
    throw new StreamError("Unsupported URL");
  }

  const id = getYouTubeId(url);
  const priorMeta = id ? peekSearchMeta(id) : undefined;
  const cached = await mediaFromLocalCache(
    url,
    mergeTrackMetadata(priorMeta, id ? { id } : undefined),
  );

  // Audio cache hit: skip extract. Show video uses YouTube embed by video id.
  if (cached) {
    onState({ status: "ready" });
    const atv = Boolean(cached.isAudioTrackVideo) || isMarkedAudioTrackVideo(id);
    return {
      ...cached,
      ...(atv ? { isAudioTrackVideo: true } : {}),
    };
  }

  onState({ status: "extracting", message: "Extracting stream..." });

  const data = await extractYouTube(url, abortSignal);
  onState({ status: "ready" });
  return mediaFromExtract(url, data);
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
