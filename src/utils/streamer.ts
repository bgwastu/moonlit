import { Media } from "@/interfaces";
import { getCookiesToUse } from "@/lib/cookies";
import {
  getTikTokId,
  getYouTubeId,
  isDirectMediaURL,
  isTikTokURL,
  isYoutubeURL,
} from "@/utils";

export interface StreamState {
  status: "idle" | "extracting" | "ready" | "error";
  message?: string;
  metadata?: Partial<Media["metadata"]>;
  duration?: number;
}

function buildMetadata(
  id: string | null,
  preload: Partial<Media["metadata"]>,
  fallback: Partial<Media["metadata"]> = {},
): Media["metadata"] {
  return {
    id,
    title: preload.title || fallback.title || "Unknown",
    author: preload.author || fallback.author || "Unknown",
    ...(preload.artist != null && { artist: preload.artist }),
    ...(preload.album != null && { album: preload.album }),
    coverUrl: preload.coverUrl || fallback.coverUrl || "",
  };
}

export async function streamWithProgress(
  url: string,
  preload: Partial<Media["metadata"]>,
  onState: (state: StreamState) => void,
  abortSignal?: AbortSignal,
): Promise<Media> {
  if (isDirectMediaURL(url)) {
    onState({ status: "ready", percent: 100 } as any);
    const fallbackTitle =
      preload.title ||
      (() => {
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

    const baseMeta = buildMetadata(null, preload, { title: fallbackTitle });

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

    return {
      fileUrl,
      sourceUrl: url,
      metadata: baseMeta,
    };
  }

  const isYouTube = isYoutubeURL(url);
  const isTikTok = isTikTokURL(url);

  let id: string | null = null;
  if (isYouTube) id = getYouTubeId(url);
  else if (isTikTok) id = getTikTokId(url);

  onState({
    status: "extracting",
    message: "Extracting stream...",
  });

  const { cookies } = await getCookiesToUse();

  const res = await fetch("/api/stream/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      cookies,
    }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Extract failed (${res.status})`);
  }

  const data = await res.json();

  const streamUrl = `/api/stream/${data.token}`;

  const resolvedMetadata = buildMetadata(id || "unknown", preload, {
    title: data.metadata?.title || "",
    author: data.metadata?.author || "",
    artist: data.metadata?.artist,
    album: data.metadata?.album,
    coverUrl: data.metadata?.coverUrl || "",
  });

  onState({
    status: "ready",
    metadata: resolvedMetadata,
    duration: data.duration,
  });

  return {
    fileUrl: streamUrl,
    sourceUrl: url,
    streamToken: data.token,
    metadata: resolvedMetadata,
  };
}
